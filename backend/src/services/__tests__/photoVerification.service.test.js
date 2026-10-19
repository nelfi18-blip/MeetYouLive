const USER_ID = "507f1f77bcf86cd799439011";

jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock("../../models/PhotoVerificationSession.js", () => ({
  findOne: jest.fn(),
  create: jest.fn(),
}));
jest.mock("../../lib/rekognitionClient.js", () => ({
  createFaceLivenessSession: jest.fn(),
  getFaceLivenessSessionResults: jest.fn(),
  compareFaces: jest.fn(),
}));

const User = require("../../models/User.js");
const PhotoVerificationSession = require("../../models/PhotoVerificationSession.js");
const rekognitionClient = require("../../lib/rekognitionClient.js");

const ORIGINAL_ENV = process.env;

const loadService = () => require("../photoVerification.service.js");

describe("photoVerification.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, PHOTO_VERIFICATION_ENABLED: "true" };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe("evaluateVerificationResult (pure decision logic)", () => {
    const config = { similarityThreshold: 90, livenessConfidenceThreshold: 80 };

    it("verifies when liveness and similarity both clear their thresholds", () => {
      const { evaluateVerificationResult } = loadService();
      expect(evaluateVerificationResult({ livenessConfidence: 95, similarity: 99 }, config)).toEqual({
        status: "verified",
        reasonCode: "MATCH",
      });
    });

    it("sends low-confidence liveness to review instead of auto-failing", () => {
      const { evaluateVerificationResult } = loadService();
      expect(evaluateVerificationResult({ livenessConfidence: 40, similarity: 99 }, config)).toEqual({
        status: "review",
        reasonCode: "LOW_LIVENESS_CONFIDENCE",
      });
    });

    it("fails only on a clear face mismatch", () => {
      const { evaluateVerificationResult } = loadService();
      expect(evaluateVerificationResult({ livenessConfidence: 95, similarity: 10 }, config)).toEqual({
        status: "failed",
        reasonCode: "FACE_MISMATCH",
      });
    });

    it("routes borderline similarity to human review, not a hard block", () => {
      const { evaluateVerificationResult } = loadService();
      expect(evaluateVerificationResult({ livenessConfidence: 95, similarity: 70 }, config)).toEqual({
        status: "review",
        reasonCode: "LOW_SIMILARITY",
      });
    });

    it("routes incomplete results (missing signals) to review", () => {
      const { evaluateVerificationResult } = loadService();
      expect(evaluateVerificationResult({ livenessConfidence: null, similarity: null }, config)).toEqual({
        status: "review",
        reasonCode: "INCOMPLETE_RESULT",
      });
    });
  });

  describe("startVerificationSession", () => {
    it("rejects when the feature flag is disabled", async () => {
      process.env.PHOTO_VERIFICATION_ENABLED = "false";
      const service = loadService();
      await expect(service.startVerificationSession(USER_ID, { consent: true })).rejects.toMatchObject({
        code: "PHOTO_VERIFICATION_DISABLED",
        status: 503,
      });
    });

    it("rejects without explicit consent", async () => {
      const service = loadService();
      await expect(service.startVerificationSession(USER_ID, { consent: false })).rejects.toMatchObject({
        code: "CONSENT_REQUIRED",
      });
    });

    it("rejects when the user has no primary photo", async () => {
      const service = loadService();
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ primaryPhoto: "", photoVerification: {} }) });
      await expect(service.startVerificationSession(USER_ID, { consent: true })).rejects.toMatchObject({
        code: "PRIMARY_PHOTO_REQUIRED",
      });
    });

    it("blocks starting a second session while one is already pending (anti-reuse/anti-abuse)", async () => {
      const service = loadService();
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ primaryPhoto: "https://img/a.jpg", photoVerification: {} }),
      });
      PhotoVerificationSession.findOne.mockResolvedValue({ _id: "existing-session" });
      await expect(service.startVerificationSession(USER_ID, { consent: true })).rejects.toMatchObject({
        code: "SESSION_ALREADY_ACTIVE",
        status: 409,
      });
      expect(rekognitionClient.createFaceLivenessSession).not.toHaveBeenCalled();
    });

    it("blocks retrying too soon after the last attempt", async () => {
      const service = loadService();
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          primaryPhoto: "https://img/a.jpg",
          photoVerification: { lastAttemptAt: new Date() },
        }),
      });
      PhotoVerificationSession.findOne.mockResolvedValue(null);
      await expect(service.startVerificationSession(USER_ID, { consent: true })).rejects.toMatchObject({
        code: "RETRY_TOO_SOON",
        status: 429,
      });
    });

    it("creates a session and marks the user pending on success", async () => {
      const service = loadService();
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ primaryPhoto: "https://img/a.jpg", photoVerification: {} }),
      });
      PhotoVerificationSession.findOne.mockResolvedValue(null);
      rekognitionClient.createFaceLivenessSession.mockResolvedValue("rek-session-1");
      PhotoVerificationSession.create.mockResolvedValue({
        _id: "session-doc-1",
        expiresAt: new Date(Date.now() + 60000),
      });
      User.updateOne.mockResolvedValue({});

      const result = await service.startVerificationSession(USER_ID, { consent: true, ip: "1.2.3.4" });
      expect(result).toMatchObject({ sessionId: "session-doc-1", rekognitionSessionId: "rek-session-1" });
      expect(User.updateOne).toHaveBeenCalledWith(
        { _id: USER_ID },
        expect.objectContaining({ $set: expect.objectContaining({ "photoVerification.status": "pending" }) })
      );
    });
  });

  describe("completeVerificationSession", () => {
    const SESSION_ID = "session-doc-1";

    it("fails when the primary photo changed since the session started", async () => {
      const service = loadService();
      const session = {
        status: "pending",
        expiresAt: new Date(Date.now() + 60000),
        primaryPhotoAtStart: "https://img/old.jpg",
        save: jest.fn().mockResolvedValue(true),
      };
      PhotoVerificationSession.findOne.mockResolvedValue(session);
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ primaryPhoto: "https://img/new.jpg" }),
      });

      await expect(service.completeVerificationSession(USER_ID, SESSION_ID)).rejects.toMatchObject({
        code: "PRIMARY_PHOTO_CHANGED",
      });
      expect(session.status).toBe("failed");
      expect(session.save).toHaveBeenCalled();
    });

    it("rejects completing an already-completed session (no duplicate processing)", async () => {
      const service = loadService();
      PhotoVerificationSession.findOne.mockResolvedValue({ status: "verified" });
      await expect(service.completeVerificationSession(USER_ID, SESSION_ID)).rejects.toMatchObject({
        code: "SESSION_ALREADY_COMPLETED",
      });
    });

    it("marks the user verified only when both liveness and similarity pass", async () => {
      const service = loadService();
      const session = {
        status: "pending",
        expiresAt: new Date(Date.now() + 60000),
        primaryPhotoAtStart: "https://img/a.jpg",
        save: jest.fn().mockResolvedValue(true),
      };
      PhotoVerificationSession.findOne.mockResolvedValue(session);
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ primaryPhoto: "https://img/a.jpg" }),
      });
      rekognitionClient.getFaceLivenessSessionResults.mockResolvedValue({
        status: "SUCCEEDED",
        confidence: 97,
        referenceImageBytes: Buffer.from("fake-bytes"),
      });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      });
      rekognitionClient.compareFaces.mockResolvedValue({ similarity: 99 });
      User.updateOne.mockResolvedValue({});

      const result = await service.completeVerificationSession(USER_ID, SESSION_ID);
      expect(result.status).toBe("verified");
      expect(User.updateOne).toHaveBeenCalledWith(
        { _id: USER_ID },
        expect.objectContaining({
          $set: expect.objectContaining({ "photoVerification.status": "verified" }),
        })
      );
    });
  });
});
