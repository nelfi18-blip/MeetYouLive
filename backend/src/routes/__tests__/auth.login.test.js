const express = require("express");
const request = require("supertest");
const bcrypt = require("bcryptjs");
const User = require("../../models/User.js");

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
  trackSafeAnalyticsEvent: jest.fn(),
}));

const authRoutes = require("../auth.routes.js");

function makeApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use("/api/auth", authRoutes);
  return app;
}

// Pre-compute a bcrypt hash of "correct-password" with low rounds for test speed.
const BCRYPT_PASSWORD = bcrypt.hashSync("correct-password", 4);

describe("POST /api/auth/login", () => {
  let app;
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    app = makeApp();
    User.exists.mockResolvedValue(false);
    User.findByIdAndUpdate.mockResolvedValue({});
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test("normalizes email (lowercases) before lookup", async () => {
    // Zod accepts valid email formats regardless of case.
    // The route handler further lowercases req.body.email before querying.
    User.findOne.mockResolvedValue(null);

    await request(app)
      .post("/api/auth/login")
      .send({ email: "User@Example.COM", password: "any" });

    expect(User.findOne).toHaveBeenCalledWith({ email: "user@example.com" });
  });

  test("returns 401 USER_NOT_FOUND when no account exists for the email", async () => {
    User.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "ghost@example.com", password: "pass123" });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("USER_NOT_FOUND");
    expect(res.body.message).toBeTruthy();
  });

  test("returns 403 and blocks login for a blocked account (before password check)", async () => {
    User.findOne.mockResolvedValue({
      _id: "blocked-user",
      email: "blocked@example.com",
      password: BCRYPT_PASSWORD,
      isBlocked: true,
      emailVerified: true,
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "blocked@example.com", password: "correct-password" });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/bloqueada/i);
  });

  test("returns 400 GOOGLE_ACCOUNT for accounts that have no local bcrypt password", async () => {
    User.findOne.mockResolvedValue({
      _id: "google-user",
      email: "google@example.com",
      // Random hex set by Google OAuth handler — not a bcrypt hash
      password: "a1b2c3d4e5f6",
      isBlocked: false,
      emailVerified: true,
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "google@example.com", password: "any-password" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("GOOGLE_ACCOUNT");
  });

  test("returns 401 for wrong password", async () => {
    User.findOne.mockResolvedValue({
      _id: "user-id",
      email: "user@example.com",
      password: BCRYPT_PASSWORD,
      isBlocked: false,
      emailVerified: true,
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body.message).toBeTruthy();
    expect(res.body.token).toBeUndefined();
  });

  test("returns 403 EMAIL_NOT_VERIFIED with email for unverified accounts", async () => {
    User.findOne.mockResolvedValue({
      _id: "unverified-id",
      email: "unverified@example.com",
      password: BCRYPT_PASSWORD,
      isBlocked: false,
      emailVerified: false,
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "unverified@example.com", password: "correct-password" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("EMAIL_NOT_VERIFIED");
    expect(res.body.email).toBe("unverified@example.com");
  });

  test("returns 200 with JWT token on successful login", async () => {
    User.findOne.mockResolvedValue({
      _id: "valid-user",
      email: "valid@example.com",
      password: BCRYPT_PASSWORD,
      isBlocked: false,
      emailVerified: true,
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "valid@example.com", password: "correct-password" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  test("allows login for legacy accounts where emailVerified is undefined (old accounts)", async () => {
    User.findOne.mockResolvedValue({
      _id: "legacy-user",
      email: "legacy@example.com",
      password: BCRYPT_PASSWORD,
      isBlocked: false,
      // emailVerified is intentionally absent — legacy accounts created before the OTP feature
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "legacy@example.com", password: "correct-password" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });
});

describe("POST /api/auth/register — SMTP failure leaves account intact", () => {
  const { sendVerificationEmail } = require("../../services/email.service.js");
  let app;
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    app = makeApp();
    User.exists.mockResolvedValue(false);
    User.deleteOne.mockResolvedValue({ deletedCount: 1 });
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test("does NOT delete account and returns requiresResend when SMTP delivery fails", async () => {
    User.create.mockResolvedValue({ _id: "smtp-fail-user" });
    sendVerificationEmail.mockRejectedValueOnce(Object.assign(new Error("delivery error"), {
      code: "EMAIL_DELIVERY_FAILED",
      status: 502,
    }));

    const res = await request(app)
      .post("/api/auth/register")
      .send({
        username: "smtpfailuser",
        email: "smtpfail@example.com",
        password: "password123",
      });

    expect(res.status).toBe(502);
    expect(res.body.requiresResend).toBe(true);
    expect(res.body.email).toBe("smtpfail@example.com");
    expect(User.deleteOne).not.toHaveBeenCalled();
  });

  test("re-registration after SMTP failure returns 400 because the unverified account still exists", async () => {
    User.create.mockResolvedValueOnce({ _id: "first-attempt" });
    sendVerificationEmail.mockRejectedValueOnce(Object.assign(new Error("smtp down"), {
      code: "EMAIL_DELIVERY_FAILED",
      status: 502,
    }));

    // First registration: SMTP fails, account kept
    await request(app)
      .post("/api/auth/register")
      .send({ username: "retryuser", email: "retry@example.com", password: "password123" });

    // Second registration attempt: MongoDB duplicate key
    User.create.mockRejectedValueOnce(Object.assign(new Error("duplicate key"), {
      code: 11000,
      keyValue: { email: "retry@example.com" },
    }));

    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "retryuser2", email: "retry@example.com", password: "password123" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/email/i);
  });
});
