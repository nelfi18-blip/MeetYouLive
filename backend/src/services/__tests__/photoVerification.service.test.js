const USER_ID = "507f1f77bcf86cd799439011";
const SESSION_OBJECT_ID = "507f1f77bcf86cd799439099";

jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock("../../models/PhotoVerificationSession.js", () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
  countDocuments: jest.fn(),
  create: jest.fn(),
}));
jest.mock("../../lib/rekognitionClient.js", () => ({
  createFaceLivenessSession: jest.fn(),
  getFaceLivenessSessionResults: jest.fn(),
  compareFaces: jest.fn(),
}));
jest.mock("../../lib/secureImageFetch.js", () => {
  class SecureImageFetchError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  }
  return {
    SecureImageFetchError,
    downloadVerifiedImageBytes: jest.fn(),
  };
});

const User = require("../../models/User.js");
const PhotoVerificationSession = require("../../models/PhotoVerificationSession.js");
const rekognitionClient = require("../../lib/rekognitionClient.js");
const secureImageFetch = require("../../lib/secureImageFetch.js");

const ORIGINAL_ENV = process.env;

const loadService = () => require("../photoVerification.service.js");

describe("photoVerification.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, PHOTO_VERIFICATION_ENABLED: "true" };
    PhotoVerificationSession.countDocuments.mockResolvedValue(0);
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

    it("blocks starting a second session while one is pending (anti-reuse/anti-abuse)", async () => {
      const service = loadService();
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ primaryPhoto: "https://res.cloudinary.com/a.jpg", photoVerification: {} }),
      });
      PhotoVerificationSession.findOne.mockResolvedValue({ _id: "existing-session" });
      await expect(service.startVerificationSession(USER_ID, { consent: true })).rejects.toMatchObject({
        code: "SESSION_ALREADY_ACTIVE",
        status: 409,
      });
      expect(rekognitionClient.createFaceLivenessSession).not.toHaveBeenCalled();
    });

    it("blocks starting a second session while one is already being processed (not just pending)", async () => {
      const service = loadService();
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ primaryPhoto: "https://res.cloudinary.com/a.jpg", photoVerification: {} }),
      });
      // Simulate the query matching a "processing" session (status $in filter).
      PhotoVerificationSession.findOne.mockResolvedValue({ _id: "processing-session", status: "processing" });
      await expect(service.startVerificationSession(USER_ID, { consent: true })).rejects.toMatchObject({
        code: "SESSION_ALREADY_ACTIVE",
        status: 409,
      });
    });

    it("blocks retrying too soon after the last attempt", async () => {
      const service = loadService();
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          primaryPhoto: "https://res.cloudinary.com/a.jpg",
          photoVerification: { lastAttemptAt: new Date() },
        }),
      });
      PhotoVerificationSession.findOne.mockResolvedValue(null);
      await expect(service.startVerificationSession(USER_ID, { consent: true })).rejects.toMatchObject({
        code: "RETRY_TOO_SOON",
        status: 429,
      });
    });

    it("enforces the daily attempt cap even when the hourly/retry checks pass", async () => {
      const service = loadService();
      process.env.PHOTO_VERIFICATION_MAX_ATTEMPTS_PER_DAY = "5";
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ primaryPhoto: "https://res.cloudinary.com/a.jpg", photoVerification: {} }),
      });
      PhotoVerificationSession.findOne.mockResolvedValue(null);
      PhotoVerificationSession.countDocuments.mockResolvedValue(5);

      await expect(service.startVerificationSession(USER_ID, { consent: true })).rejects.toMatchObject({
        code: "DAILY_LIMIT_REACHED",
        status: 429,
      });
      expect(rekognitionClient.createFaceLivenessSession).not.toHaveBeenCalled();
    });

    it("creates a session and marks the user pending on success", async () => {
      const service = loadService();
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ primaryPhoto: "https://res.cloudinary.com/a.jpg", photoVerification: {} }),
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
        expect.objectContaining({
          $set: expect.objectContaining({
            "photoVerification.status": "pending",
            "photoVerification.activeSessionId": "session-doc-1",
          }),
        })
      );
    });
  });

  describe("completeVerificationSession", () => {
    const SESSION_ID = "session-doc-1";

    const buildSession = (overrides = {}) => ({
      _id: SESSION_OBJECT_ID,
      userId: USER_ID,
      status: "pending",
      expiresAt: new Date(Date.now() + 60000),
      primaryPhotoAtStart: "https://res.cloudinary.com/a.jpg",
      ...overrides,
    });

    it("rejects completing an already-completed session (no duplicate processing)", async () => {
      const service = loadService();
      PhotoVerificationSession.findOne.mockResolvedValue(buildSession({ status: "verified" }));
      PhotoVerificationSession.findOneAndUpdate.mockResolvedValue(null);

      await expect(service.completeVerificationSession(USER_ID, SESSION_ID)).rejects.toMatchObject({
        code: "SESSION_ALREADY_COMPLETED",
      });
    });

    it("rejects a second concurrent completion attempt while the first is still processing", async () => {
      const service = loadService();
      // First findOne (pre-claim read) sees "pending"; the atomic claim fails
      // because another request already flipped it to "processing"; the
      // follow-up re-read (to build a precise error) sees "processing".
      PhotoVerificationSession.findOne
        .mockResolvedValueOnce(buildSession({ status: "pending" }))
        .mockResolvedValueOnce(buildSession({ status: "processing" }));
      PhotoVerificationSession.findOneAndUpdate.mockResolvedValue(null);

      await expect(service.completeVerificationSession(USER_ID, SESSION_ID)).rejects.toMatchObject({
        code: "SESSION_PROCESSING",
        status: 409,
      });
      expect(rekognitionClient.getFaceLivenessSessionResults).not.toHaveBeenCalled();
    });

    it("fails when the primary photo changed since the session started", async () => {
      const service = loadService();
      const session = buildSession();
      PhotoVerificationSession.findOne.mockResolvedValue(session);
      PhotoVerificationSession.findOneAndUpdate.mockResolvedValue({ ...session, status: "processing" });
      PhotoVerificationSession.updateOne.mockResolvedValue({});
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ primaryPhoto: "https://res.cloudinary.com/new.jpg" }),
      });
      User.updateOne.mockResolvedValue({ matchedCount: 1 });

      await expect(service.completeVerificationSession(USER_ID, SESSION_ID)).rejects.toMatchObject({
        code: "PRIMARY_PHOTO_CHANGED",
      });
      expect(PhotoVerificationSession.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({ status: "processing" }),
        expect.objectContaining({ $set: expect.objectContaining({ status: "failed" }) })
      );
    });

    it("marks the user verified only when both liveness and similarity pass", async () => {
      const service = loadService();
      const session = buildSession();
      PhotoVerificationSession.findOne.mockResolvedValue(session);
      PhotoVerificationSession.findOneAndUpdate.mockResolvedValue({ ...session, status: "processing" });
      PhotoVerificationSession.updateOne.mockResolvedValue({});
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ primaryPhoto: "https://res.cloudinary.com/a.jpg" }),
      });
      rekognitionClient.getFaceLivenessSessionResults.mockResolvedValue({
        status: "SUCCEEDED",
        confidence: 97,
        referenceImageBytes: Buffer.from("fake-bytes"),
      });
      secureImageFetch.downloadVerifiedImageBytes.mockResolvedValue(Buffer.from([1, 2, 3]));
      rekognitionClient.compareFaces.mockResolvedValue({ similarity: 99 });
      User.updateOne.mockResolvedValue({ matchedCount: 1 });

      const result = await service.completeVerificationSession(USER_ID, SESSION_ID);
      expect(result.status).toBe("verified");
      expect(User.updateOne).toHaveBeenCalledWith(
        { _id: USER_ID, "photoVerification.activeSessionId": SESSION_OBJECT_ID },
        expect.objectContaining({
          $set: expect.objectContaining({ "photoVerification.status": "verified" }),
        })
      );
    });

    it("does not overwrite the user's status when a newer session has since taken over", async () => {
      const service = loadService();
      const session = buildSession();
      PhotoVerificationSession.findOne.mockResolvedValue(session);
      PhotoVerificationSession.findOneAndUpdate.mockResolvedValue({ ...session, status: "processing" });
      PhotoVerificationSession.updateOne.mockResolvedValue({});
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ primaryPhoto: "https://res.cloudinary.com/a.jpg" }),
      });
      rekognitionClient.getFaceLivenessSessionResults.mockResolvedValue({
        status: "SUCCEEDED",
        confidence: 97,
        referenceImageBytes: Buffer.from("fake-bytes"),
      });
      secureImageFetch.downloadVerifiedImageBytes.mockResolvedValue(Buffer.from([1, 2, 3]));
      rekognitionClient.compareFaces.mockResolvedValue({ similarity: 99 });
      // Simulate a newer session now owning activeSessionId — the conditional
      // update matches nothing.
      User.updateOne.mockResolvedValue({ matchedCount: 0 });

      await expect(service.completeVerificationSession(USER_ID, SESSION_ID)).rejects.toMatchObject({
        code: "SESSION_SUPERSEDED",
        status: 409,
      });
    });

    it("surfaces a malicious/unauthorized primary photo host as a safe, generic error", async () => {
      const service = loadService();
      const session = buildSession({ primaryPhotoAtStart: "https://evil.example.com/a.jpg" });
      PhotoVerificationSession.findOne.mockResolvedValue(session);
      PhotoVerificationSession.findOneAndUpdate.mockResolvedValue({ ...session, status: "processing" });
      PhotoVerificationSession.updateOne.mockResolvedValue({});
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ primaryPhoto: "https://evil.example.com/a.jpg" }),
      });
      rekognitionClient.getFaceLivenessSessionResults.mockResolvedValue({
        status: "SUCCEEDED",
        confidence: 97,
        referenceImageBytes: Buffer.from("fake-bytes"),
      });
      secureImageFetch.downloadVerifiedImageBytes.mockRejectedValue(
        new secureImageFetch.SecureImageFetchError("HOST_NOT_ALLOWED", "This photo host is not authorized.")
      );

      await expect(service.completeVerificationSession(USER_ID, SESSION_ID)).rejects.toMatchObject({
        code: "PRIMARY_PHOTO_UNREACHABLE",
        status: 502,
      });
    });
  });
});
