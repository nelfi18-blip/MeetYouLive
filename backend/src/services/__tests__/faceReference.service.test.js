const crypto = require("crypto");

const USER_ID = "507f1f77bcf86cd799439011";
const KEY = crypto.randomBytes(32).toString("base64");

jest.mock("../../models/FaceReference.js", () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock("../../models/FaceReferenceAudit.js", () => ({
  create: jest.fn().mockResolvedValue({}),
}));
jest.mock("../../lib/rekognitionClient.js", () => ({
  ensureCollection: jest.fn(),
  indexFace: jest.fn(),
  searchFacesByImage: jest.fn(),
  deleteFaces: jest.fn(),
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

const FaceReference = require("../../models/FaceReference.js");
const FaceReferenceAudit = require("../../models/FaceReferenceAudit.js");
const rekognitionClient = require("../../lib/rekognitionClient.js");
const secureImageFetch = require("../../lib/secureImageFetch.js");

const ORIGINAL_ENV = process.env;

const loadService = () => require("../faceReference.service.js");

const baseEnv = {
  PHOTO_VERIFICATION_ENABLED: "true",
  FACE_REFERENCE_ENABLED: "true",
  FACE_REFERENCE_ENCRYPTION_KEY: KEY,
  FACE_REFERENCE_MATCH_THRESHOLD: "92",
};

describe("faceReference.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, ...baseEnv };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe("saveFaceReferenceFromVerifiedSession", () => {
    it("does nothing when the feature flag is off (fails closed)", async () => {
      process.env.FACE_REFERENCE_ENABLED = "false";
      const service = loadService();
      const result = await service.saveFaceReferenceFromVerifiedSession({
        userId: USER_ID,
        imageBytes: Buffer.from("selfie-bytes"),
      });
      expect(result).toEqual({ saved: false, reasonCode: "FEATURE_DISABLED" });
      expect(rekognitionClient.indexFace).not.toHaveBeenCalled();
    });

    it("does nothing when the encryption key is missing (never stores unprotected)", async () => {
      process.env.FACE_REFERENCE_ENCRYPTION_KEY = "";
      const service = loadService();
      const result = await service.saveFaceReferenceFromVerifiedSession({
        userId: USER_ID,
        imageBytes: Buffer.from("selfie-bytes"),
      });
      expect(result.saved).toBe(false);
      expect(rekognitionClient.indexFace).not.toHaveBeenCalled();
    });

    it("indexes the face and persists only the encrypted opaque FaceId", async () => {
      const service = loadService();
      FaceReference.findOne.mockResolvedValue(null);
      rekognitionClient.ensureCollection.mockResolvedValue();
      rekognitionClient.indexFace.mockResolvedValue({ faceId: "aws-face-1", faceCount: 1 });
      FaceReference.findOneAndUpdate.mockResolvedValue({ _id: "ref-1" });

      const result = await service.saveFaceReferenceFromVerifiedSession({
        userId: USER_ID,
        imageBytes: Buffer.from("selfie-bytes"),
        ip: "1.2.3.4",
      });

      expect(result).toEqual({ saved: true });
      const [, update] = FaceReference.findOneAndUpdate.mock.calls[0];
      expect(update.$set.encryptedFaceId).not.toBe("aws-face-1"); // never stored in cleartext
      expect(update.$set.encryptedFaceId.split(":")).toHaveLength(3);
      expect(FaceReferenceAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: "created" })
      );
    });

    it("never throws (best-effort) when AWS indexing fails", async () => {
      const service = loadService();
      FaceReference.findOne.mockResolvedValue(null);
      rekognitionClient.ensureCollection.mockResolvedValue();
      rekognitionClient.indexFace.mockRejectedValue(new Error("AWS down"));

      const result = await service.saveFaceReferenceFromVerifiedSession({
        userId: USER_ID,
        imageBytes: Buffer.from("selfie-bytes"),
      });
      expect(result.saved).toBe(false);
    });

    it("replaces a previously active reference instead of accumulating faces", async () => {
      const service = loadService();
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      FaceReference.findOne.mockResolvedValue({
        status: "active",
        collectionId: "meetyoulive-photo-verification",
        encryptedFaceId: encryptFaceId("old-face-id", KEY),
      });
      rekognitionClient.ensureCollection.mockResolvedValue();
      rekognitionClient.indexFace.mockResolvedValue({ faceId: "new-face-id", faceCount: 1 });
      FaceReference.findOneAndUpdate.mockResolvedValue({ _id: "ref-1" });

      await service.saveFaceReferenceFromVerifiedSession({ userId: USER_ID, imageBytes: Buffer.from("bytes") });

      expect(rekognitionClient.deleteFaces).toHaveBeenCalledWith("meetyoulive-photo-verification", ["old-face-id"]);
    });
  });

  describe("compareAgainstReference", () => {
    it("returns unavailable when the feature is disabled (caller must fall back to old behavior)", async () => {
      process.env.FACE_REFERENCE_ENABLED = "false";
      const service = loadService();
      const result = await service.compareAgainstReference({ userId: USER_ID, newPhotoUrl: "https://a/b.jpg" });
      expect(result.status).toBe("unavailable");
      expect(FaceReference.findOne).not.toHaveBeenCalled();
    });

    it("returns no_reference when the user never consented / has no reference", async () => {
      const service = loadService();
      FaceReference.findOne.mockResolvedValue(null);
      const result = await service.compareAgainstReference({ userId: USER_ID, newPhotoUrl: "https://a/b.jpg" });
      expect(result.status).toBe("no_reference");
    });

    it("returns no_reference for an expired reference even if status is still active", async () => {
      const service = loadService();
      FaceReference.findOne.mockResolvedValue({
        _id: "ref-1",
        status: "active",
        retentionExpiresAt: new Date(Date.now() - 1000),
      });
      FaceReference.updateOne.mockResolvedValue({});
      const result = await service.compareAgainstReference({ userId: USER_ID, newPhotoUrl: "https://a/b.jpg" });
      expect(result.status).toBe("no_reference");
    });

    it("verifies the new photo as the SAME person (reuses the badge without a new selfie)", async () => {
      const service = loadService();
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      FaceReference.findOne.mockResolvedValue({
        _id: "ref-1",
        status: "active",
        collectionId: "meetyoulive-photo-verification",
        encryptedFaceId: encryptFaceId("stored-face-id", KEY),
        retentionExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });
      secureImageFetch.downloadVerifiedImageBytes.mockResolvedValue(Buffer.from([1, 2, 3]));
      rekognitionClient.searchFacesByImage.mockResolvedValue({ faceId: "stored-face-id", similarity: 99 });
      FaceReference.updateOne.mockResolvedValue({});

      const result = await service.compareAgainstReference({ userId: USER_ID, newPhotoUrl: "https://a/new.jpg" });
      expect(result).toEqual({ status: "verified", reasonCode: "MATCH" });
    });

    it("does NOT approve a different person's photo (fails closed)", async () => {
      const service = loadService();
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      FaceReference.findOne.mockResolvedValue({
        _id: "ref-1",
        status: "active",
        collectionId: "meetyoulive-photo-verification",
        encryptedFaceId: encryptFaceId("stored-face-id", KEY),
        retentionExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });
      secureImageFetch.downloadVerifiedImageBytes.mockResolvedValue(Buffer.from([1, 2, 3]));
      // A different face entirely (or no match at all) in the collection.
      rekognitionClient.searchFacesByImage.mockResolvedValue(null);

      const result = await service.compareAgainstReference({ userId: USER_ID, newPhotoUrl: "https://a/other.jpg" });
      expect(result.status).toBe("mismatch");
    });

    it("does NOT approve when the matched FaceId belongs to someone else's indexed face", async () => {
      const service = loadService();
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      FaceReference.findOne.mockResolvedValue({
        _id: "ref-1",
        status: "active",
        collectionId: "meetyoulive-photo-verification",
        encryptedFaceId: encryptFaceId("stored-face-id", KEY),
        retentionExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });
      secureImageFetch.downloadVerifiedImageBytes.mockResolvedValue(Buffer.from([1, 2, 3]));
      // Collection returns SOME match, but it's not this user's own FaceId.
      rekognitionClient.searchFacesByImage.mockResolvedValue({ faceId: "someone-elses-face-id", similarity: 99 });

      const result = await service.compareAgainstReference({ userId: USER_ID, newPhotoUrl: "https://a/other.jpg" });
      expect(result.status).toBe("mismatch");
    });

    it("never auto-approves on AWS/network errors — falls back to requiring a new selfie", async () => {
      const service = loadService();
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      FaceReference.findOne.mockResolvedValue({
        _id: "ref-1",
        status: "active",
        collectionId: "meetyoulive-photo-verification",
        encryptedFaceId: encryptFaceId("stored-face-id", KEY),
        retentionExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });
      secureImageFetch.downloadVerifiedImageBytes.mockResolvedValue(Buffer.from([1, 2, 3]));
      rekognitionClient.searchFacesByImage.mockRejectedValue(new Error("AWS unavailable"));

      const result = await service.compareAgainstReference({ userId: USER_ID, newPhotoUrl: "https://a/other.jpg" });
      expect(result.status).toBe("error");
    });

    it("never auto-approves when the new photo cannot be downloaded", async () => {
      const service = loadService();
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      FaceReference.findOne.mockResolvedValue({
        _id: "ref-1",
        status: "active",
        collectionId: "meetyoulive-photo-verification",
        encryptedFaceId: encryptFaceId("stored-face-id", KEY),
        retentionExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });
      secureImageFetch.downloadVerifiedImageBytes.mockRejectedValue(
        new secureImageFetch.SecureImageFetchError("HOST_NOT_ALLOWED", "blocked")
      );

      const result = await service.compareAgainstReference({ userId: USER_ID, newPhotoUrl: "https://evil/x.jpg" });
      expect(result.status).toBe("error");
      expect(rekognitionClient.searchFacesByImage).not.toHaveBeenCalled();
    });
  });

  describe("revokeFaceReference", () => {
    it("is idempotent when there is no active reference to revoke", async () => {
      const service = loadService();
      FaceReference.findOneAndUpdate.mockResolvedValue(null);
      const result = await service.revokeFaceReference(USER_ID, { ip: "1.2.3.4" });
      expect(result).toEqual({ revoked: false });
      expect(rekognitionClient.deleteFaces).not.toHaveBeenCalled();
    });

    it("atomically claims the active reference, deletes the AWS face, and marks it revoked", async () => {
      const service = loadService();
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      FaceReference.findOneAndUpdate.mockResolvedValue({
        collectionId: "meetyoulive-photo-verification",
        encryptedFaceId: encryptFaceId("stored-face-id", KEY),
      });
      rekognitionClient.deleteFaces.mockResolvedValue();

      const result = await service.revokeFaceReference(USER_ID, { ip: "1.2.3.4" });
      expect(result).toEqual({ revoked: true });
      expect(rekognitionClient.deleteFaces).toHaveBeenCalledWith("meetyoulive-photo-verification", [
        "stored-face-id",
      ]);
      expect(FaceReference.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: USER_ID, status: "active" },
        expect.objectContaining({ $set: expect.objectContaining({ status: "revoked" }) }),
        expect.any(Object)
      );
    });

    it("still reports success (local record already revoked) even if the AWS delete fails", async () => {
      const service = loadService();
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      FaceReference.findOneAndUpdate.mockResolvedValue({
        collectionId: "meetyoulive-photo-verification",
        encryptedFaceId: encryptFaceId("stored-face-id", KEY),
      });
      rekognitionClient.deleteFaces.mockRejectedValue(new Error("AWS down"));

      const result = await service.revokeFaceReference(USER_ID, {});
      expect(result).toEqual({ revoked: true });
    });
  });

  describe("getFaceReferenceStatus", () => {
    it("reports hasReference:false when nothing is active", async () => {
      const service = loadService();
      FaceReference.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
      const result = await service.getFaceReferenceStatus(USER_ID);
      expect(result.hasReference).toBe(false);
    });

    it("reports hasReference:true with non-biometric metadata only", async () => {
      const service = loadService();
      const consentedAt = new Date();
      const retentionExpiresAt = new Date(Date.now() + 1000 * 60 * 60);
      FaceReference.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue({ consentedAt, retentionExpiresAt, lastUsedAt: null }),
      });
      const result = await service.getFaceReferenceStatus(USER_ID);
      expect(result).toEqual({ hasReference: true, consentedAt, retentionExpiresAt, lastUsedAt: null });
    });
  });
});
