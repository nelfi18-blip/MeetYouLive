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

const mockVerifyIdToken = jest.fn();
jest.mock("google-auth-library", () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: mockVerifyIdToken,
  })),
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
    User.findByIdAndUpdate.mockReturnValue({ catch: jest.fn() });
    process.env.GOOGLE_CLIENT_ID = "web-client-id.apps.googleusercontent.com";
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
        name: "Normal User",
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
    expect(createArg.name).toBe("Normal User");
    expect(createArg.emailVerificationCode).toBe(sha256(sentCode));
    expect(createArg.emailVerificationCode).not.toBe(sentCode);
    expect(createArg.emailVerificationSentAt).toBeInstanceOf(Date);
    expect(User.create).toHaveBeenCalledWith(expect.not.objectContaining({ location: "usa" }));
  });

  test("google-session creates verified Google account with provider fields", async () => {
    User.findOne.mockResolvedValue(null);
    User.create.mockResolvedValue({
      _id: "google-user-1",
      email: "google@example.com",
      name: "Google User",
      username: "google",
      role: "user",
      onboardingComplete: false,
      creatorStatus: "none",
    });

    const res = await request(app)
      .post("/api/auth/google-session")
      .send({
        email: "Google@Example.com",
        googleId: "google-sub-1",
        name: "Google User",
        photoUrl: "https://lh3.googleusercontent.com/a/photo=s96-c",
      });

    expect(res.status).toBe(200);
    expect(User.create).toHaveBeenCalledWith(expect.objectContaining({
      email: "google@example.com",
      authProvider: "google",
      googleId: "google-sub-1",
      emailVerified: true,
      emailVerificationCode: null,
      emailVerificationExpires: null,
      emailVerificationSentAt: null,
    }));
    const createPayload = User.create.mock.calls[0][0];
    expect(createPayload).not.toHaveProperty("stripeCustomerId");
    expect(createPayload).not.toHaveProperty("stripeAccountId");
    expect(createPayload).not.toHaveProperty("subscriptionId");
  });

  test("google-session does not persist an email-derived name for a new Google user", async () => {
    User.findOne.mockResolvedValue(null);
    User.create.mockResolvedValue({
      _id: "google-user-email-fallback",
      email: "housetito563@gmail.com",
      username: "housetito563",
      role: "user",
      onboardingComplete: false,
      creatorStatus: "none",
    });

    const res = await request(app)
      .post("/api/auth/google-session")
      .send({ email: "housetito563@gmail.com", name: "" });

    expect(res.status).toBe(200);
    const createPayload = User.create.mock.calls[0][0];
    expect(createPayload.username).toBe("housetito563");
    expect(createPayload).not.toHaveProperty("name");
  });

  test("google-session updates existing account as verified Google account without Stripe changes", async () => {
    const existingUser = {
      _id: "google-user-2",
      email: "existing-google@example.com",
      name: "",
      username: "existinggoogle",
      role: "user",
      onboardingComplete: false,
      creatorStatus: "none",
      authProvider: "local",
      googleId: null,
      emailVerified: false,
      emailVerificationCode: "123456",
      emailVerificationExpires: new Date("2026-01-01T00:00:00.000Z"),
      emailVerificationSentAt: new Date("2026-01-01T00:00:00.000Z"),
      save: jest.fn().mockResolvedValue(undefined),
    };
    User.findOne.mockResolvedValue(existingUser);
    User.findByIdAndUpdate.mockReturnValue({ catch: jest.fn() });

    const res = await request(app)
      .post("/api/auth/google-session")
      .send({
        email: "existing-google@example.com",
        googleId: "google-sub-2",
        name: "Existing Google",
      });

    expect(res.status).toBe(200);
    expect(existingUser.authProvider).toBe("google");
    expect(existingUser.googleId).toBe("google-sub-2");
    expect(existingUser.emailVerified).toBe(true);
    expect(existingUser.emailVerificationCode).toBeNull();
    expect(existingUser.emailVerificationExpires).toBeNull();
    expect(existingUser.emailVerificationSentAt).toBeNull();
    expect(existingUser.save).toHaveBeenCalledTimes(1);
    expect(existingUser).not.toHaveProperty("stripeCustomerId");
    expect(existingUser).not.toHaveProperty("stripeAccountId");
    expect(existingUser).not.toHaveProperty("subscriptionId");
  });

  test("google-native verifies Google ID token and creates verified Google account", async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        iss: "https://accounts.google.com",
        aud: "web-client-id.apps.googleusercontent.com",
        exp,
        sub: "native-google-sub",
        email: "NativeGoogle@Example.com",
        email_verified: true,
        name: "Native Google",
        picture: "https://lh3.googleusercontent.com/a/native=s96-c",
      }),
    });
    User.findOne.mockResolvedValue(null);
    User.create.mockResolvedValue({
      _id: "native-google-user",
      email: "nativegoogle@example.com",
      name: "Native Google",
      username: "nativegoogle",
      role: "user",
      onboardingComplete: false,
      creatorStatus: "none",
    });

    const res = await request(app)
      .post("/api/auth/google-native")
      .send({ idToken: "valid-id-token" });

    expect(res.status).toBe(200);
    expect(mockVerifyIdToken).toHaveBeenCalledWith({
      idToken: "valid-id-token",
      audience: "web-client-id.apps.googleusercontent.com",
    });
    expect(User.create).toHaveBeenCalledWith(expect.objectContaining({
      email: "nativegoogle@example.com",
      authProvider: "google",
      googleId: "native-google-sub",
      emailVerified: true,
    }));
    expect(res.body.token).toBeTruthy();
  });

  test("google-native rejects unverified Google email without creating an account", async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        iss: "accounts.google.com",
        aud: "web-client-id.apps.googleusercontent.com",
        exp: Math.floor(Date.now() / 1000) + 3600,
        sub: "native-google-sub",
        email: "native@example.com",
        email_verified: false,
      }),
    });

    const res = await request(app)
      .post("/api/auth/google-native")
      .send({ idToken: "unverified-id-token" });

    expect(res.status).toBe(401);
    expect(User.findOne).not.toHaveBeenCalled();
    expect(User.create).not.toHaveBeenCalled();
  });

  test("google-session preserves an existing edited name and does not replace it with Google data", async () => {
    const existingUser = {
      _id: "edited-google-user",
      email: "housetito563@gmail.com",
      name: "Nombre Editado",
      username: "housetito563",
      role: "user",
      onboardingComplete: true,
      creatorStatus: "none",
      authProvider: "local",
      googleId: null,
      emailVerified: true,
      emailVerificationCode: null,
      emailVerificationExpires: null,
      emailVerificationSentAt: null,
      save: jest.fn().mockResolvedValue(undefined),
    };
    User.findOne.mockResolvedValue(existingUser);
    User.findByIdAndUpdate.mockReturnValue({ catch: jest.fn() });

    const res = await request(app)
      .post("/api/auth/google-session")
      .send({
        email: "housetito563@gmail.com",
        googleId: "google-sub-edited",
        name: "Google Name",
      });

    expect(res.status).toBe(200);
    expect(existingUser.name).toBe("Nombre Editado");
    expect(existingUser.authProvider).toBe("google");
    expect(existingUser.googleId).toBe("google-sub-edited");
    expect(existingUser.save).toHaveBeenCalledTimes(1);
  });

  test("google-session preserves approved creator classification for existing Google creator", async () => {
    const creatorApprovedAt = new Date("2026-01-01T00:00:00.000Z");
    const existingUser = {
      _id: "creator-google-1",
      email: "creator-google@example.com",
      name: "Creator Google",
      username: "creatorgoogle",
      role: "creator",
      onboardingComplete: true,
      creatorStatus: "approved",
      isVerifiedCreator: true,
      creatorApprovedAt,
      creatorProfile: { displayName: "Creator Google", liveEnabled: true },
      coins: 100,
      earningsCoins: 50,
      authProvider: "google",
      googleId: "google-creator-1",
      emailVerified: true,
      emailVerificationCode: null,
      emailVerificationExpires: null,
      emailVerificationSentAt: null,
      save: jest.fn().mockResolvedValue(undefined),
    };
    User.findOne.mockResolvedValue(existingUser);
    User.findByIdAndUpdate.mockReturnValue({ catch: jest.fn() });

    const res = await request(app)
      .post("/api/auth/google-session")
      .send({
        email: "creator-google@example.com",
        googleId: "google-creator-1",
        name: "Updated Display Name",
      });

    expect(res.status).toBe(200);
    expect(existingUser).toMatchObject({
      role: "creator",
      creatorStatus: "approved",
      isVerifiedCreator: true,
      creatorProfile: { displayName: "Creator Google", liveEnabled: true },
      coins: 100,
      earningsCoins: 50,
      authProvider: "google",
      emailVerified: true,
    });
    expect(existingUser.creatorApprovedAt).toBe(creatorApprovedAt);
    expect(existingUser.save).not.toHaveBeenCalled();
    expect(res.body.user).toMatchObject({
      role: "creator",
      creatorStatus: "approved",
    });
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

  test("registration keeps unverified account and returns requiresResend when email fails", async () => {
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
    expect(res.body.code).toBe("EMAIL_NOT_CONFIGURED");
    expect(res.body.email).toBe("mailfail@example.com");
    expect(res.body.requiresResend).toBe(true);
    // Account must NOT be deleted — user can go to verify-email and request a resend
    expect(User.deleteOne).not.toHaveBeenCalled();
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
    expect(res.body.resendAfter).toBe(60);
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
      password: MOCK_HASH,
      emailVerified: false,
      emailVerificationSentAt: null,
      save,
    };
    User.findOne.mockResolvedValue(user);
    User.exists.mockResolvedValue(false);

    const res = await request(app)
      .post("/api/auth/update-unverified-email")
      .set("X-Forwarded-For", "10.0.1.1")
      .send({ oldEmail: "old@example.com", newEmail: "new@example.com", password: "correctpassword" });

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

  test("update-unverified-email rejects if password field is missing", async () => {
    const res = await request(app)
      .post("/api/auth/update-unverified-email")
      .set("X-Forwarded-For", "10.0.1.2")
      .send({ oldEmail: "old@example.com", newEmail: "new@example.com" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/password/i);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  test("update-unverified-email rejects with 401 when password is wrong", async () => {
    const bcrypt = require("bcryptjs");
    bcrypt.compare.mockResolvedValueOnce(false);

    User.findOne.mockResolvedValue({
      _id: "user-wrong-pw",
      email: "wrong-pw@example.com",
      password: MOCK_HASH,
      emailVerified: false,
      save: jest.fn(),
    });
    User.exists.mockResolvedValue(false);

    const res = await request(app)
      .post("/api/auth/update-unverified-email")
      .set("X-Forwarded-For", "10.0.1.3")
      .send({ oldEmail: "wrong-pw@example.com", newEmail: "new-addr@example.com", password: "wrongpassword" });

    expect(res.status).toBe(401);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  test("update-unverified-email returns 404 for unknown account (anti-enumeration)", async () => {
    User.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/auth/update-unverified-email")
      .set("X-Forwarded-For", "10.0.1.4")
      .send({ oldEmail: "ghost@example.com", newEmail: "new@example.com", password: "anypassword" });

    expect(res.status).toBe(404);
    // Must not expose whether the account exists or what went wrong
    expect(res.body.message).not.toMatch(/password/i);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  test("update-unverified-email invalidates previous OTP after a successful change", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const previousCode = sha256("123456");
    const user = {
      _id: "user-invalidate-otp",
      email: "old-inv@example.com",
      password: MOCK_HASH,
      emailVerified: false,
      emailVerificationCode: previousCode,
      emailVerificationExpires: new Date(Date.now() + 60_000),
      save,
    };
    User.findOne.mockResolvedValue(user);
    User.exists.mockResolvedValue(false);

    await request(app)
      .post("/api/auth/update-unverified-email")
      .set("X-Forwarded-For", "10.0.1.5")
      .send({ oldEmail: "old-inv@example.com", newEmail: "new-inv@example.com", password: "correctpassword" });

    // The stored OTP must be replaced — old code no longer valid
    expect(user.emailVerificationCode).not.toBe(previousCode);
    expect(user.emailVerificationCode).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
  });

  test("update-unverified-email rejects if new email is already taken", async () => {
    User.findOne.mockResolvedValue({
      _id: "user-change-email-2",
      email: "old2@example.com",
      password: MOCK_HASH,
      emailVerified: false,
      emailVerificationSentAt: null,
      save: jest.fn(),
    });
    User.exists.mockResolvedValue(true); // new email is taken

    const res = await request(app)
      .post("/api/auth/update-unverified-email")
      .set("X-Forwarded-For", "10.0.1.6")
      .send({ oldEmail: "old2@example.com", newEmail: "taken@example.com", password: "correctpassword" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/ya existe/i);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  test("update-unverified-email rejects invalid email format", async () => {
    const res = await request(app)
      .post("/api/auth/update-unverified-email")
      .set("X-Forwarded-For", "10.0.1.7")
      .send({ oldEmail: "old3@example.com", newEmail: "not-an-email", password: "correctpassword" });

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
