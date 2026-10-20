const crypto = require("crypto");

const USER_ID = "507f1f77bcf86cd799439011";
const KEY = crypto.randomBytes(32).toString("base64");

jest.mock("../../models/FaceReference.js", () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
  find: jest.fn(),
}));
jest.mock("../../models/FaceReferenceAudit.js", () => ({
  create: jest.fn().mockResolvedValue({}),
  countDocuments: jest.fn().mockResolvedValue(0),
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
    FaceReferenceAudit.countDocuments.mockResolvedValue(0);
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

    it("schedules AWS deletion of a previously active reference instead of accumulating faces (no orphaned vector)", async () => {
      const service = loadService();
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      FaceReference.findOne.mockResolvedValue({
        _id: "old-ref-1",
        status: "active",
        collectionId: "meetyoulive-photo-verification",
        encryptedFaceId: encryptFaceId("old-face-id", KEY),
      });
      // schedulePendingDeletion's findOneAndUpdate (pipeline update) call —
      // returns the claimed doc WITH the pendingDelete* fields populated.
      FaceReference.findOneAndUpdate
        .mockResolvedValueOnce({
          _id: "old-ref-1",
          pendingDeleteCollectionId: "meetyoulive-photo-verification",
          pendingDeleteEncryptedFaceId: encryptFaceId("old-face-id", KEY),
          postDeletionStatus: "revoked",
          deletionAttempts: 0,
        })
        // The upsert for the NEW reference.
        .mockResolvedValueOnce({ _id: "ref-1" });
      rekognitionClient.ensureCollection.mockResolvedValue();
      rekognitionClient.indexFace.mockResolvedValue({ faceId: "new-face-id", faceCount: 1 });
      rekognitionClient.deleteFaces.mockResolvedValue();

      await service.saveFaceReferenceFromVerifiedSession({ userId: USER_ID, imageBytes: Buffer.from("bytes") });
      // Give the best-effort, fire-and-forget deletion attempt a tick to run.
      await new Promise((resolve) => setImmediate(resolve));

      expect(rekognitionClient.deleteFaces).toHaveBeenCalledWith("meetyoulive-photo-verification", ["old-face-id"]);
      // The NEW reference's own upsert never touches the old face's
      // pendingDelete* tracking fields.
      const upsertCall = FaceReference.findOneAndUpdate.mock.calls[1];
      expect(upsertCall[1].$set.encryptedFaceId).not.toContain("old-face-id");
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

    it("fails closed with a rate-limit error once too many comparisons were attempted recently", async () => {
      const service = loadService();
      FaceReferenceAudit.countDocuments.mockResolvedValue(20); // >= default max (20)
      const result = await service.compareAgainstReference({ userId: USER_ID, newPhotoUrl: "https://a/b.jpg" });
      expect(result).toEqual({ status: "error", reasonCode: "RATE_LIMITED" });
      expect(FaceReference.findOne).not.toHaveBeenCalled();
      expect(FaceReferenceAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: "rate_limited" })
      );
    });

    it("returns no_reference when the user never consented / has no reference", async () => {
      const service = loadService();
      FaceReference.findOne.mockResolvedValue(null);
      const result = await service.compareAgainstReference({ userId: USER_ID, newPhotoUrl: "https://a/b.jpg" });
      expect(result.status).toBe("no_reference");
    });

    it("returns no_reference for an expired reference even if status is still active, and schedules its AWS deletion", async () => {
      const service = loadService();
      FaceReference.findOne.mockResolvedValue({
        _id: "ref-1",
        status: "active",
        retentionExpiresAt: new Date(Date.now() - 1000),
      });
      FaceReference.findOneAndUpdate.mockResolvedValue({
        _id: "ref-1",
        pendingDeleteCollectionId: "",
        pendingDeleteEncryptedFaceId: "",
        postDeletionStatus: "expired",
      });
      FaceReference.updateOne.mockResolvedValue({});
      const result = await service.compareAgainstReference({ userId: USER_ID, newPhotoUrl: "https://a/b.jpg" });
      expect(result.status).toBe("no_reference");
      await new Promise((resolve) => setImmediate(resolve));
      expect(FaceReference.findOneAndUpdate).toHaveBeenCalled();
    });

    it("never reuses a revoked/pending-deletion reference (DB query itself excludes non-active status)", async () => {
      const service = loadService();
      FaceReference.findOne.mockResolvedValue(null);
      const result = await service.compareAgainstReference({ userId: USER_ID, newPhotoUrl: "https://a/b.jpg" });
      expect(result.status).toBe("no_reference");
      expect(FaceReference.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ status: "active", consentWithdrawnAt: null })
      );
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

    it("atomically claims the active reference (pending_deletion), deletes the AWS face, and confirms it", async () => {
      const service = loadService();
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      FaceReference.findOneAndUpdate.mockResolvedValue({
        _id: "ref-1",
        collectionId: "meetyoulive-photo-verification",
        pendingDeleteCollectionId: "meetyoulive-photo-verification",
        pendingDeleteEncryptedFaceId: encryptFaceId("stored-face-id", KEY),
        postDeletionStatus: "revoked",
        deletionAttempts: 0,
      });
      rekognitionClient.deleteFaces.mockResolvedValue();

      const result = await service.revokeFaceReference(USER_ID, { ip: "1.2.3.4" });
      expect(result).toEqual({ revoked: true, deletionConfirmed: true });
      expect(rekognitionClient.deleteFaces).toHaveBeenCalledWith("meetyoulive-photo-verification", [
        "stored-face-id",
      ]);
      // The claim itself is a pipeline update moving status OUT of "active"
      // immediately — never used for a comparison again regardless of the
      // AWS outcome below.
      const [filter, pipeline] = FaceReference.findOneAndUpdate.mock.calls[0];
      expect(filter).toEqual({ userId: USER_ID, status: "active" });
      expect(pipeline[0].$set.status).toBe("pending_deletion");
      expect(pipeline[0].$set.postDeletionStatus).toBe("revoked");
      // Final confirmation settles the local record to "revoked" and clears
      // the encrypted pointer.
      expect(FaceReference.updateOne).toHaveBeenCalledWith(
        { _id: "ref-1" },
        expect.objectContaining({ $set: expect.objectContaining({ status: "revoked", encryptedFaceId: "" }) })
      );
    });

    it("reports revoked:true locally but deletionConfirmed:false and schedules a retry when the AWS delete fails", async () => {
      const service = loadService();
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      FaceReference.findOneAndUpdate.mockResolvedValue({
        _id: "ref-1",
        pendingDeleteCollectionId: "meetyoulive-photo-verification",
        pendingDeleteEncryptedFaceId: encryptFaceId("stored-face-id", KEY),
        postDeletionStatus: "revoked",
        deletionAttempts: 0,
      });
      rekognitionClient.deleteFaces.mockRejectedValue(new Error("AWS down"));

      const result = await service.revokeFaceReference(USER_ID, {});
      expect(result).toEqual({ revoked: true, deletionConfirmed: false });
      // The failed attempt is tracked (never silently dropped) so a retry
      // job can safely pick it back up.
      expect(FaceReference.updateOne).toHaveBeenCalledWith(
        { _id: "ref-1" },
        expect.objectContaining({
          $set: expect.objectContaining({ deletionAttempts: 1, lastDeletionError: expect.any(String) }),
        })
      );
      // Never informs success as if AWS had confirmed it.
      expect(FaceReference.updateOne).not.toHaveBeenCalledWith(
        { _id: "ref-1" },
        expect.objectContaining({ $set: expect.objectContaining({ deletionConfirmedAt: expect.anything() }) })
      );
    });

    it("never logs the raw FaceId/encrypted payload when a deletion attempt fails", async () => {
      const service = loadService();
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      const encrypted = encryptFaceId("super-secret-face-id", KEY);
      FaceReference.findOneAndUpdate.mockResolvedValue({
        _id: "ref-1",
        pendingDeleteCollectionId: "meetyoulive-photo-verification",
        pendingDeleteEncryptedFaceId: encrypted,
        postDeletionStatus: "revoked",
        deletionAttempts: 0,
      });
      rekognitionClient.deleteFaces.mockRejectedValue(new Error("AWS down"));
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      await service.revokeFaceReference(USER_ID, {});

      const loggedText = errorSpy.mock.calls.map((args) => args.join(" ")).join("\n");
      expect(loggedText).not.toContain("super-secret-face-id");
      expect(loggedText).not.toContain(encrypted);
      errorSpy.mockRestore();
    });
  });

  describe("retryPendingFaceReferenceDeletions", () => {
    it("retries every reference still marked deletionPending and reports confirmed vs still-pending counts", async () => {
      const service = loadService();
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      FaceReference.find.mockReturnValue({
        limit: jest.fn().mockResolvedValue([
          {
            _id: "ref-ok",
            pendingDeleteCollectionId: "col",
            pendingDeleteEncryptedFaceId: encryptFaceId("face-ok", KEY),
            postDeletionStatus: "revoked",
            deletionAttempts: 1,
          },
          {
            _id: "ref-still-failing",
            pendingDeleteCollectionId: "col",
            pendingDeleteEncryptedFaceId: encryptFaceId("face-fail", KEY),
            postDeletionStatus: "revoked",
            deletionAttempts: 3,
          },
        ]),
      });
      rekognitionClient.deleteFaces.mockImplementation(async (col, [faceId]) => {
        if (faceId === "face-fail") throw new Error("still down");
      });
      FaceReference.updateOne.mockResolvedValue({});

      const result = await service.retryPendingFaceReferenceDeletions();
      expect(result).toEqual({ processed: 2, confirmed: 1, stillPending: 1 });
    });
  });

  describe("revokeFaceReferenceForAccountDeletion", () => {
    it("schedules deletion of an active or already-pending reference when an account is deleted", async () => {
      const service = loadService();
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      FaceReference.findOneAndUpdate.mockResolvedValue({
        _id: "ref-1",
        pendingDeleteCollectionId: "col",
        pendingDeleteEncryptedFaceId: encryptFaceId("face-1", KEY),
        postDeletionStatus: "revoked",
        deletionAttempts: 0,
      });
      rekognitionClient.deleteFaces.mockResolvedValue();

      const result = await service.revokeFaceReferenceForAccountDeletion(USER_ID);
      expect(result).toEqual({ scheduled: true });
      const [filter] = FaceReference.findOneAndUpdate.mock.calls[0];
      expect(filter).toEqual({ userId: USER_ID, status: { $in: ["active", "pending_deletion"] } });
    });

    it("is a no-op when there is nothing to delete", async () => {
      const service = loadService();
      FaceReference.findOneAndUpdate.mockResolvedValue(null);
      const result = await service.revokeFaceReferenceForAccountDeletion(USER_ID);
      expect(result).toEqual({ scheduled: false });
      expect(rekognitionClient.deleteFaces).not.toHaveBeenCalled();
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
