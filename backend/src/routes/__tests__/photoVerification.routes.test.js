const express = require("express");
const request = require("supertest");

const USER_ID = "507f1f77bcf86cd799439011";

jest.mock("../../middlewares/auth.middleware.js", () => ({
  verifyToken: (req, _res, next) => {
    req.userId = USER_ID;
    next();
  },
  optionalVerifyToken: (_req, _res, next) => next(),
}));

jest.mock("../../services/photoVerification.service.js", () => {
  class PhotoVerificationError extends Error {
    constructor(code, message, status = 400) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  return {
    PhotoVerificationError,
    startVerificationSession: jest.fn(),
    completeVerificationSession: jest.fn(),
    getVerificationStatus: jest.fn(),
  };
});

const photoVerificationService = require("../../services/photoVerification.service.js");
const photoVerificationRoutes = require("../photoVerification.routes.js");

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/photo-verification", photoVerificationRoutes);
  return app;
};

describe("photoVerification.routes", () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = makeApp();
  });

  it("returns 503 (feature disabled) surfaced from the service without ever claiming success", async () => {
    photoVerificationService.startVerificationSession.mockRejectedValue(
      new photoVerificationService.PhotoVerificationError(
        "PHOTO_VERIFICATION_DISABLED",
        "La verificación de foto no está disponible todavía.",
        503
      )
    );

    const res = await request(app).post("/api/photo-verification/start").send({ consent: true });
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ ok: false, code: "PHOTO_VERIFICATION_DISABLED" });
  });

  it("requires explicit consent to be passed through to the service as a boolean", async () => {
    photoVerificationService.startVerificationSession.mockResolvedValue({
      sessionId: "s1",
      rekognitionSessionId: "r1",
      expiresAt: new Date().toISOString(),
    });

    await request(app).post("/api/photo-verification/start").send({});
    expect(photoVerificationService.startVerificationSession).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ consent: false })
    );
  });

  it("never lets the client declare its own verification result on complete", async () => {
    photoVerificationService.completeVerificationSession.mockResolvedValue({ status: "verified", reasonCode: "MATCH" });

    const res = await request(app)
      .post("/api/photo-verification/session-1/complete")
      .send({ status: "verified" }); // client-supplied status must be ignored

    expect(res.status).toBe(200);
    // The controller only ever forwards userId + sessionId — the service
    // owns the decision, and the body's "status" field is never read.
    expect(photoVerificationService.completeVerificationSession).toHaveBeenCalledWith(USER_ID, "session-1");
  });

  it("surfaces duplicate/reused session attempts as a 409 instead of 200", async () => {
    photoVerificationService.completeVerificationSession.mockRejectedValue(
      new photoVerificationService.PhotoVerificationError("SESSION_ALREADY_COMPLETED", "Esta sesión ya fue procesada.", 409)
    );

    const res = await request(app).post("/api/photo-verification/session-1/complete").send({});
    expect(res.status).toBe(409);
    expect(res.body.ok).toBe(false);
  });

  it("returns the server-authoritative status for GET /status", async () => {
    photoVerificationService.getVerificationStatus.mockResolvedValue({
      enabled: false,
      status: "none",
      verifiedAt: null,
    });

    const res = await request(app).get("/api/photo-verification/status");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, enabled: false, status: "none" });
  });
});
