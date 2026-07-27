const crypto = require("crypto");
const express = require("express");
const request = require("supertest");
const User = require("../../models/User.js");
const { sendVerificationEmail, sendPasswordResetEmail } = require("../../services/email.service.js");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

jest.mock("../../models/User.js", () => ({
  create: jest.fn(),
  deleteOne: jest.fn(),
  exists: jest.fn(),
  findOne: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

jest.mock("../../services/email.service.js", () => ({
  sendVerificationEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
}));

jest.mock("../../services/analytics.service.js", () => ({
  trackAnalyticsEvent: jest.fn(),
}));

// Always resolve compare → true so password checks pass without real hashing.
// The bcrypt regex guard in the login route requires a $2b$-style prefix.
const MOCK_HASH = "$2b$10$mockedhashmockedhashmockedhas12";
jest.mock("bcryptjs", () => ({
  hash: jest.fn().mockResolvedValue("$2b$10$mockedhashmockedhashmockedhas12"),
  compare: jest.fn().mockResolvedValue(true),
}));

const authRoutes = require("../auth.routes.js");

function sha256(str) {
  return crypto.createHash("sha256").update(String(str)).digest("hex");
}

function makeApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use("/api/auth", authRoutes);
  return app;
}

function makeInviteQuery(result) {
  return {
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(result),
    }),
  };
}

describe("auth email verification delivery", () => {
  let app;
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    // resetAllMocks clears queued mockOnce implementations, preventing bleed across tests.
    jest.resetAllMocks();
    app = makeApp();
    User.exists.mockResolvedValue(false);
    User.deleteOne.mockResolvedValue({ deletedCount: 1 });
    sendVerificationEmail.mockResolvedValue({ messageId: "test-message-id" });
    sendPasswordResetEmail.mockResolvedValue({ messageId: "reset-message-id" });
    // Restore bcrypt mocks after reset
    const bcrypt = require("bcryptjs");
    bcrypt.hash.mockResolvedValue(MOCK_HASH);
    bcrypt.compare.mockResolvedValue(true);
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test("normal registration only returns verification success after email is sent", async () => {
    User.create.mockResolvedValue({ _id: "user-1" });

    const res = await request(app)
      .post("/api/auth/register")
      .send({
        username: "normaluser",
        email: "NormalUser@example.com",
        password: "password123",
      });

    expect(res.status).toBe(201);
    expect(res.body.requiresVerification).toBe(true);
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(sendVerificationEmail.mock.calls[0][0]).toBe("normaluser@example.com");
    const sentCode = sendVerificationEmail.mock.calls[0][1];
    expect(sentCode).toMatch(/^\d{6}$/);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[register] Verification email sent",
      { userId: "user-1", email: "normaluser@example.com" }
    );
    expect(User.deleteOne).not.toHaveBeenCalled();
    // OTP must be stored as SHA-256 hash of the code sent by email, not as plaintext
    const createArg = User.create.mock.calls[0][0];
    expect(createArg.emailVerificationCode).toBe(sha256(sentCode));
    expect(createArg.emailVerificationCode).not.toBe(sentCode);
    expect(createArg.emailVerificationSentAt).toBeInstanceOf(Date);
    expect(User.create).toHaveBeenCalledWith(expect.not.objectContaining({ location: "usa" }));
  });

  test("new registration stores structured location objects safely", async () => {
    User.create.mockResolvedValue({ _id: "user-location-object" });

    const res = await request(app)
      .post("/api/auth/register")
      .send({
        username: "locationobject",
        email: "location-object@example.com",
        password: "password123",
        location: { country: "USA", city: "", region: "" },
      });

    expect(res.status).toBe(201);
    expect(User.create).toHaveBeenCalledWith(expect.objectContaining({
      location: expect.objectContaining({
        type: "Point",
        country: "USA",
        city: "",
        region: "",
        label: "USA",
      }),
      locationLabel: "USA",
      locationPoint: null,
    }));
  });

  test("new registration normalizes legacy string location before saving", async () => {
    User.create.mockResolvedValue({ _id: "user-location-string" });

    const res = await request(app)
      .post("/api/auth/register")
      .send({
        username: "locationstring",
        email: "location-string@example.com",
        password: "password123",
        location: "usa",
      });

    expect(res.status).toBe(201);
    expect(User.create).toHaveBeenCalledWith(expect.objectContaining({
      location: expect.objectContaining({
        type: "Point",
        country: "usa",
        city: "",
        region: "",
        label: "usa",
      }),
      locationLabel: "usa",
      locationPoint: null,
    }));
  });

  test("creator invite registration requires email delivery before returning success", async () => {
    User.findOne.mockReturnValueOnce(makeInviteQuery({ _id: "creator-1" }));
    User.create.mockResolvedValue({ _id: "subcreator-1" });

    const res = await request(app)
      .post("/api/auth/register")
      .send({
        username: "creatorinvitee",
        email: "creator@example.com",
        password: "password123",
        creatorInvite: "ABC123",
      });

    expect(res.status).toBe(201);
    expect(sendVerificationEmail).toHaveBeenCalledWith(
      "creator@example.com",
      expect.stringMatching(/^\d{6}$/)
    );
    expect(User.create).toHaveBeenCalledWith(expect.objectContaining({
      role: "subCreator",
      creatorStatus: "pending",
      invitedByCreator: "creator-1",
    }));
  });

  test("registration returns a clear error and cleans up when email is not configured", async () => {
    User.create.mockResolvedValue({ _id: "user-2" });
    sendVerificationEmail.mockRejectedValueOnce(Object.assign(new Error("SMTP configuration missing"), {
      code: "EMAIL_NOT_CONFIGURED",
      status: 500,
    }));

    const res = await request(app)
      .post("/api/auth/register")
      .send({
        username: "mailfailuser",
        email: "mailfail@example.com",
        password: "password123",
      });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      code: "EMAIL_NOT_CONFIGURED",
      message: "El servicio de email no está configurado correctamente. Contacta a soporte.",
    });
    expect(User.deleteOne).toHaveBeenCalledWith({ _id: "user-2", emailVerified: false });
  });

  test("resend does not show success when the provider rejects delivery", async () => {
    User.findOne.mockResolvedValue({
      _id: "user-3",
      emailVerified: false,
      emailVerificationSentAt: null,
      save: jest.fn().mockResolvedValue(undefined),
    });
    sendVerificationEmail.mockRejectedValueOnce(Object.assign(new Error("provider rejected message"), {
      code: "EMAIL_DELIVERY_FAILED",
      status: 502,
    }));

    const res = await request(app)
      .post("/api/auth/resend-verification")
      .send({ email: "retry@example.com" });

    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      code: "EMAIL_DELIVERY_FAILED",
      message: "No se pudo enviar el correo de verificación. Inténtalo de nuevo en unos minutos.",
    });
  });

  test("resend enforces server-side 60s cooldown per user", async () => {
    const recentlySent = new Date(Date.now() - 30_000); // 30 seconds ago
    User.findOne.mockResolvedValue({
      _id: "user-cooldown",
      emailVerified: false,
      emailVerificationSentAt: recentlySent,
      save: jest.fn().mockResolvedValue(undefined),
    });

    const res = await request(app)
      .post("/api/auth/resend-verification")
      .send({ email: "cooldown@example.com" });

    expect(res.status).toBe(429);
    expect(res.body.code).toBe("RESEND_COOLDOWN");
    expect(typeof res.body.resendAfter).toBe("number");
    expect(res.body.resendAfter).toBeGreaterThan(0);
    expect(res.body.resendAfter).toBeLessThanOrEqual(60);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  test("resend stores new OTP as hash and resets sentAt when cooldown has passed", async () => {
    const longAgo = new Date(Date.now() - 120_000); // 2 minutes ago
    const save = jest.fn().mockResolvedValue(undefined);
    const user = {
      _id: "user-resend-hash",
      emailVerified: false,
      emailVerificationSentAt: longAgo,
      emailVerificationCode: "old-hash",
      emailVerificationExpires: new Date(Date.now() + 60_000),
      save,
    };
    User.findOne.mockResolvedValue(user);

    const res = await request(app)
      .post("/api/auth/resend-verification")
      .send({ email: "resend-hash@example.com" });

    expect(res.status).toBe(200);
    const sentCode = sendVerificationEmail.mock.calls[0][1];
    expect(user.emailVerificationCode).toBe(sha256(sentCode));
    expect(user.emailVerificationCode).not.toBe(sentCode);
    expect(user.emailVerificationSentAt).toBeInstanceOf(Date);
    expect(save).toHaveBeenCalledTimes(1);
  });

  test("verify email succeeds with correct hashed OTP and returns a token", async () => {
    const rawCode = "654321";
    const save = jest.fn().mockResolvedValue(undefined);
    const user = {
      _id: "user-verify-hash",
      email: "verify@example.com",
      emailVerified: false,
      emailVerificationCode: sha256(rawCode),
      emailVerificationExpires: new Date(Date.now() + 60_000),
      save,
    };
    User.findOne.mockResolvedValue(user);

    const res = await request(app)
      .post("/api/auth/verify-email")
      .send({ email: "verify@example.com", code: rawCode });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Email verificado correctamente");
    expect(res.body.token).toBeTruthy();
    expect(user.emailVerified).toBe(true);
    expect(user.emailVerificationCode).toBeNull();
    expect(user.emailVerificationExpires).toBeNull();
    expect(save).toHaveBeenCalledTimes(1);
  });

  test("verify email rejects incorrect OTP", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    User.findOne.mockResolvedValue({
      _id: "user-wrong-code",
      email: "wrong@example.com",
      emailVerified: false,
      emailVerificationCode: sha256("999999"),
      emailVerificationExpires: new Date(Date.now() + 60_000),
      save,
    });

    const res = await request(app)
      .post("/api/auth/verify-email")
      .send({ email: "wrong@example.com", code: "111111" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/incorrecto/i);
    expect(save).not.toHaveBeenCalled();
  });

  test("verify email rejects expired OTP", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    User.findOne.mockResolvedValue({
      _id: "user-expired-code",
      email: "expired@example.com",
      emailVerified: false,
      emailVerificationCode: sha256("123456"),
      emailVerificationExpires: new Date(Date.now() - 1_000), // already expired
      save,
    });

    const res = await request(app)
      .post("/api/auth/verify-email")
      .send({ email: "expired@example.com", code: "123456" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("CODE_EXPIRED");
    expect(save).not.toHaveBeenCalled();
  });

  test("login is blocked for unverified users", async () => {
    User.findOne.mockResolvedValue({
      _id: "user-unverified-login",
      email: "unverified@example.com",
      password: MOCK_HASH,
      emailVerified: false,
      isBlocked: false,
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "unverified@example.com", password: "password123" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("EMAIL_NOT_VERIFIED");
  });

  test("update-unverified-email changes email and sends new OTP", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const user = {
      _id: "user-change-email",
      email: "old@example.com",
      emailVerified: false,
      emailVerificationSentAt: null,
      save,
    };
    User.findOne.mockResolvedValue(user);
    User.exists.mockResolvedValue(false);

    const res = await request(app)
      .post("/api/auth/update-unverified-email")
      .send({ oldEmail: "old@example.com", newEmail: "new@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.email).toBe("new@example.com");
    expect(sendVerificationEmail).toHaveBeenCalledWith(
      "new@example.com",
      expect.stringMatching(/^\d{6}$/)
    );
    expect(user.email).toBe("new@example.com");
    const sentCode = sendVerificationEmail.mock.calls[0][1];
    expect(user.emailVerificationCode).toBe(sha256(sentCode));
    expect(save).toHaveBeenCalledTimes(1);
  });

  test("update-unverified-email rejects if new email is already taken", async () => {
    User.findOne.mockResolvedValue({
      _id: "user-change-email-2",
      email: "old2@example.com",
      emailVerified: false,
      emailVerificationSentAt: null,
      save: jest.fn(),
    });
    User.exists.mockResolvedValue(true); // new email is taken

    const res = await request(app)
      .post("/api/auth/update-unverified-email")
      .send({ oldEmail: "old2@example.com", newEmail: "taken@example.com" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/ya existe/i);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  test("update-unverified-email rejects invalid email format", async () => {
    const res = await request(app)
      .post("/api/auth/update-unverified-email")
      .send({ oldEmail: "old3@example.com", newEmail: "not-an-email" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/formato/i);
  });

  test("forgot password returns delivery error and restores reset state when SMTP fails", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const user = {
      _id: "user-reset",
      passwordResetCode: null,
      passwordResetExpiresAt: null,
      passwordResetRequestedAt: null,
      save,
    };
    User.findOne.mockResolvedValue(user);
    sendPasswordResetEmail.mockRejectedValueOnce(Object.assign(new Error("SMTP configuration missing"), {
      code: "EMAIL_NOT_CONFIGURED",
      status: 500,
    }));

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "reset@example.com" });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      code: "EMAIL_NOT_CONFIGURED",
      message: "El servicio de email no está configurado correctamente. Contacta a soporte.",
    });
    expect(sendPasswordResetEmail).toHaveBeenCalledWith(
      "reset@example.com",
      expect.stringMatching(/^\d{6}$/)
    );
    expect(user.passwordResetCode).toBeNull();
    expect(user.passwordResetExpiresAt).toBeNull();
    expect(user.passwordResetRequestedAt).toBeNull();
    expect(save).toHaveBeenCalledTimes(2);
  });
});
