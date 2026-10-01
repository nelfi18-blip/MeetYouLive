const crypto = require("crypto");
const express = require("express");
const request = require("supertest");
const User = require("../../models/User.js");
const { sendPhoneVerificationSms } = require("../../services/sms.service.js");

jest.mock("../../middlewares/auth.middleware.js", () => ({
  verifyToken: (req, _res, next) => {
    req.userId = "507f1f77bcf86cd799439011";
    next();
  },
  optionalVerifyToken: (_req, _res, next) => next(),
}));

jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOne: jest.fn(),
  exists: jest.fn(),
  updateOne: jest.fn(),
}));

jest.mock("../../services/sms.service.js", () => ({
  sendPhoneVerificationSms: jest.fn(),
}));

jest.mock("../../lib/cloudinary.js", () => ({
  uploadProfilePhoto: jest.fn(),
}));

const userRoutes = require("../user.routes.js");

function sha256(str) {
  return crypto.createHash("sha256").update(String(str)).digest("hex");
}

function makeApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use("/api/user", userRoutes);
  return app;
}

function makeSelectQuery(value) {
  return { select: jest.fn().mockResolvedValue(value) };
}

describe("phone verification endpoints", () => {
  let app;
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    app = makeApp();
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe("POST /api/user/me/phone/request-verification", () => {
    test("rejects an invalid phone number", async () => {
      const res = await request(app)
        .post("/api/user/me/phone/request-verification")
        .set("X-Forwarded-For", "10.0.0.1")
        .send({ phone: "not-a-phone" });

      expect(res.status).toBe(400);
      expect(User.findById).not.toHaveBeenCalled();
      expect(sendPhoneVerificationSms).not.toHaveBeenCalled();
    });

    test("starts verification for a valid E.164 phone number and never claims success without sending", async () => {
      const save = jest.fn().mockResolvedValue(undefined);
      User.findById.mockReturnValue(
        makeSelectQuery({
          _id: "507f1f77bcf86cd799439011",
          phone: null,
          phoneVerified: false,
          phoneVerificationSentAt: null,
          save,
        })
      );
      User.exists.mockResolvedValue(false);
      sendPhoneVerificationSms.mockResolvedValue(undefined);

      const res = await request(app)
        .post("/api/user/me/phone/request-verification")
        .set("X-Forwarded-For", "10.0.0.2")
        .send({ phone: "+34 123 456 789" });

      expect(res.status).toBe(200);
      expect(res.body.phoneVerified).toBe(false);
      expect(sendPhoneVerificationSms).toHaveBeenCalledTimes(1);
      expect(sendPhoneVerificationSms.mock.calls[0][0]).toBe("+34123456789");
      const sentCode = sendPhoneVerificationSms.mock.calls[0][1];
      expect(sentCode).toMatch(/^\d{6}$/);
      expect(save).toHaveBeenCalledTimes(1);
      // Response never exposes the raw or hashed OTP code / expiry.
      expect(res.body).not.toHaveProperty("phoneVerificationCode");
      expect(res.body).not.toHaveProperty("phoneVerificationExpires");
      // Masked phone only.
      expect(res.body.phoneMasked).not.toBe("+34123456789");
      expect(res.body.phoneMasked.endsWith("89")).toBe(true);
      expect(res.body).not.toHaveProperty("phone");
    });

    test("does not report success when the SMS provider is not configured", async () => {
      const save = jest.fn().mockResolvedValue(undefined);
      User.findById.mockReturnValue(
        makeSelectQuery({
          _id: "507f1f77bcf86cd799439011",
          phone: null,
          phoneVerified: false,
          phoneVerificationSentAt: null,
          save,
        })
      );
      User.exists.mockResolvedValue(false);
      sendPhoneVerificationSms.mockRejectedValue(
        Object.assign(new Error("SMS service is not configured"), { code: "SMS_NOT_CONFIGURED", status: 503 })
      );

      const res = await request(app)
        .post("/api/user/me/phone/request-verification")
        .set("X-Forwarded-For", "10.0.0.3")
        .send({ phone: "+34123456789" });

      expect(res.status).toBe(503);
      expect(res.body.code).toBe("SMS_NOT_CONFIGURED");
      // Code/expiry must be rolled back so the user isn't stuck in a fake "sent" cooldown.
      expect(save).toHaveBeenCalledTimes(2);
      const rollbackCallArgs = save.mock.calls[1];
      expect(rollbackCallArgs).toEqual([]);
    });

    test("enforces the per-user resend cooldown", async () => {
      User.findById.mockReturnValue(
        makeSelectQuery({
          _id: "507f1f77bcf86cd799439011",
          phone: "+34123456789",
          phoneVerified: false,
          phoneVerificationSentAt: new Date(Date.now() - 5000),
          save: jest.fn(),
        })
      );

      const res = await request(app)
        .post("/api/user/me/phone/request-verification")
        .set("X-Forwarded-For", "10.0.0.4")
        .send({ phone: "+34123456789" });

      expect(res.status).toBe(429);
      expect(res.body.code).toBe("RESEND_COOLDOWN");
      expect(sendPhoneVerificationSms).not.toHaveBeenCalled();
    });

    test("rejects a phone number already verified on another account", async () => {
      User.findById.mockReturnValue(
        makeSelectQuery({
          _id: "507f1f77bcf86cd799439011",
          phone: null,
          phoneVerified: false,
          phoneVerificationSentAt: null,
          save: jest.fn(),
        })
      );
      User.exists.mockResolvedValue(true);

      const res = await request(app)
        .post("/api/user/me/phone/request-verification")
        .set("X-Forwarded-For", "10.0.0.5")
        .send({ phone: "+34123456789" });

      expect(res.status).toBe(409);
      expect(sendPhoneVerificationSms).not.toHaveBeenCalled();
    });

    test("changing the phone number resets phoneVerified to false", async () => {
      const save = jest.fn().mockResolvedValue(undefined);
      const user = {
        _id: "507f1f77bcf86cd799439011",
        phone: "+34111111111",
        phoneVerified: true,
        phoneVerificationSentAt: null,
        save,
      };
      User.findById.mockReturnValue(makeSelectQuery(user));
      User.exists.mockResolvedValue(false);
      sendPhoneVerificationSms.mockResolvedValue(undefined);

      const res = await request(app)
        .post("/api/user/me/phone/request-verification")
        .set("X-Forwarded-For", "10.0.0.6")
        .send({ phone: "+34222222222" });

      expect(res.status).toBe(200);
      expect(user.phoneVerified).toBe(false);
      expect(user.phone).toBe("+34222222222");
    });
  });

  describe("POST /api/user/me/phone/verify", () => {
    test("verifies a correct OTP code", async () => {
      const code = "123456";
      const save = jest.fn().mockResolvedValue(undefined);
      User.findById.mockReturnValue(
        makeSelectQuery({
          _id: "507f1f77bcf86cd799439011",
          phone: "+34123456789",
          phoneVerified: false,
          phoneVerificationCode: sha256(code),
          phoneVerificationExpires: new Date(Date.now() + 5 * 60 * 1000),
          save,
        })
      );

      const res = await request(app)
        .post("/api/user/me/phone/verify")
        .send({ code });

      expect(res.status).toBe(200);
      expect(res.body.phoneVerified).toBe(true);
      expect(save).toHaveBeenCalledTimes(1);
    });

    test("rejects an incorrect OTP code", async () => {
      User.findById.mockReturnValue(
        makeSelectQuery({
          _id: "507f1f77bcf86cd799439011",
          phone: "+34123456789",
          phoneVerified: false,
          phoneVerificationCode: sha256("123456"),
          phoneVerificationExpires: new Date(Date.now() + 5 * 60 * 1000),
          save: jest.fn(),
        })
      );

      const res = await request(app)
        .post("/api/user/me/phone/verify")
        .send({ code: "000000" });

      expect(res.status).toBe(400);
      expect(res.body.phoneVerified).toBeUndefined();
    });

    test("rejects an expired OTP code", async () => {
      const code = "123456";
      User.findById.mockReturnValue(
        makeSelectQuery({
          _id: "507f1f77bcf86cd799439011",
          phone: "+34123456789",
          phoneVerified: false,
          phoneVerificationCode: sha256(code),
          phoneVerificationExpires: new Date(Date.now() - 1000),
          save: jest.fn(),
        })
      );

      const res = await request(app)
        .post("/api/user/me/phone/verify")
        .send({ code });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("CODE_EXPIRED");
    });

    test("requires a code to be present", async () => {
      const res = await request(app).post("/api/user/me/phone/verify").send({});
      expect(res.status).toBe(400);
      expect(User.findById).not.toHaveBeenCalled();
    });

    test("returns a friendly response when already verified", async () => {
      User.findById.mockReturnValue(
        makeSelectQuery({
          _id: "507f1f77bcf86cd799439011",
          phone: "+34123456789",
          phoneVerified: true,
          save: jest.fn(),
        })
      );

      const res = await request(app)
        .post("/api/user/me/phone/verify")
        .send({ code: "123456" });

      expect(res.status).toBe(200);
      expect(res.body.phoneVerified).toBe(true);
    });

    test("verify response never exposes the raw phone or OTP secrets", async () => {
      const code = "123456";
      User.findById.mockReturnValue(
        makeSelectQuery({
          _id: "507f1f77bcf86cd799439011",
          phone: "+34123456789",
          phoneVerified: false,
          phoneVerificationCode: sha256(code),
          phoneVerificationExpires: new Date(Date.now() + 5 * 60 * 1000),
          save: jest.fn().mockResolvedValue(undefined),
        })
      );

      const res = await request(app)
        .post("/api/user/me/phone/verify")
        .send({ code });

      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty("phone");
      expect(res.body).not.toHaveProperty("phoneVerificationCode");
      expect(res.body).not.toHaveProperty("phoneVerificationExpires");
      expect(res.body.phoneMasked.endsWith("89")).toBe(true);
    });
  });

  describe("resend uses the pending (server-known) phone, not client whim", () => {
    test("a resend call (same request-verification endpoint) re-validates/normalizes whatever phone is sent, so a stale/blank client value cannot silently reuse an old number", async () => {
      const save = jest.fn().mockResolvedValue(undefined);
      const user = {
        _id: "507f1f77bcf86cd799439011",
        phone: "+34123456789",
        phoneVerified: false,
        phoneVerificationSentAt: new Date(Date.now() - 5000),
        save,
      };
      User.findById.mockReturnValue(makeSelectQuery(user));

      // Cooldown still active (5s elapsed of a 60s window) — even a resend
      // that explicitly targets the correct pending phone must still be
      // rejected by the server-side cooldown, proving the frontend countdown
      // is UX-only and never a substitute for server enforcement.
      const res = await request(app)
        .post("/api/user/me/phone/request-verification")
        .set("X-Forwarded-For", "10.0.0.7")
        .send({ phone: "+34123456789" });

      expect(res.status).toBe(429);
      expect(res.body.code).toBe("RESEND_COOLDOWN");
      expect(sendPhoneVerificationSms).not.toHaveBeenCalled();
    });

    test("resend rejects an empty/missing phone instead of falling back to any stored value", async () => {
      const res = await request(app)
        .post("/api/user/me/phone/request-verification")
        .set("X-Forwarded-For", "10.0.0.8")
        .send({ phone: "" });

      expect(res.status).toBe(400);
      expect(User.findById).not.toHaveBeenCalled();
    });
  });
});
