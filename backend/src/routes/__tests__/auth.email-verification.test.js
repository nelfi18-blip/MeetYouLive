const express = require("express");
const request = require("supertest");
const User = require("../../models/User.js");
const { sendVerificationEmail } = require("../../services/email.service.js");

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

const authRoutes = require("../auth.routes.js");

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
    jest.clearAllMocks();
    app = makeApp();
    User.exists.mockResolvedValue(false);
    User.deleteOne.mockResolvedValue({ deletedCount: 1 });
    sendVerificationEmail.mockResolvedValue({ messageId: "test-message-id" });
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
    expect(sendVerificationEmail.mock.calls[0][1]).toMatch(/^\d{6}$/);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[register] Verification email sent",
      { userId: "user-1", email: "normaluser@example.com" }
    );
    expect(User.deleteOne).not.toHaveBeenCalled();
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

  test("verify email marks the user verified and returns a token", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const user = {
      _id: "user-legacy-location",
      email: "verify@example.com",
      emailVerified: false,
      emailVerificationCode: "123456",
      emailVerificationExpires: new Date(Date.now() + 60_000),
      save,
    };
    User.findOne.mockResolvedValue(user);

    const res = await request(app)
      .post("/api/auth/verify-email")
      .send({ email: "verify@example.com", code: "123456" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Email verificado correctamente");
    expect(res.body.token).toBeTruthy();
    expect(user.emailVerified).toBe(true);
    expect(user.emailVerificationCode).toBeNull();
    expect(user.emailVerificationExpires).toBeNull();
    expect(save).toHaveBeenCalledTimes(1);
  });
});
