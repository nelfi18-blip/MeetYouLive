const crypto = require("crypto");
const mongoose = require("mongoose");

const USER_ID = "507f1f77bcf86cd799439011";
const KEY = crypto.randomBytes(32).toString("base64");

jest.mock("../../models/FaceReference.js", () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock("../../models/FaceReferenceDeletion.js", () => ({
  create: jest.fn(),
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
const FaceReferenceDeletion = require("../../models/FaceReferenceDeletion.js");
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

// Helper: makes FaceReferenceDeletion.create resolve to a usable "created"
// document, mirroring what Mongoose would actually return. The real call
// site passes an ARRAY (`Model.create([{...}], {session})`), so the mock
// must resolve to an array too.
const mockDeletionCreated = (overrides = {}) => {
  const doc = {
    _id: overrides._id || "deletion-1",
    userId: overrides.userId || USER_ID,
    collectionId: overrides.collectionId || "meetyoulive-photo-verification",
    encryptedFaceId: overrides.encryptedFaceId,
    reason: overrides.reason || "replaced",
    status: "pending",
  };
  FaceReferenceDeletion.create.mockResolvedValueOnce([doc]);
  return doc;
};

// Helper: a fake Mongoose client session whose `withTransaction` just runs
// the callback inline (mirrors the convention already used in
// random.service.test.js) — the retire+persist-deletion transaction is
// exercised through this, never against a real replica set.
const makeDbSession = () => ({ withTransaction: jest.fn(async (fn) => fn()), endSession: jest.fn() });

// Helper: makes the retire+persist transaction fail every attempt (as if
// MongoDB itself was unavailable for all PERSIST_RETRY_ATTEMPTS retries),
// by having `withTransaction` always reject with the given error.
const makeFailingDbSession = (err = new Error("Mongo write failed")) => ({
  withTransaction: jest.fn(async () => {
    throw err;
  }),
  endSession: jest.fn(),
});

// Helper: a minimal, REAL atomic in-memory substitute for a single
// FaceReferenceDeletion document, used ONLY to exercise attemptPendingDeletion's
// own exclusive-claim logic (`findOneAndUpdate`'s conditional filter) against
// actual shared, mutable state — instead of pre-scripting which concurrent
// caller "wins" via mockResolvedValueOnce ordering. Every method here runs
// fully synchronously (no internal await before reading/mutating `doc`), so
// whichever concurrent call's microtask reaches it first genuinely wins the
// claim, exactly like a single atomic Mongo write would — the outcome is a
// property of the (fake) data, not of call order baked into the mock.
const matchesCondition = (doc, cond) =>
  Object.entries(cond).every(([key, val]) => {
    if (val && typeof val === "object" && "$lt" in val) {
      const current = doc[key];
      if (!(current instanceof Date)) return true; // null/undefined treated as "stale enough"
      return current.getTime() < val.$lt.getTime();
    }
    return String(doc[key]) === String(val);
  });

const matchesFilter = (doc, filter) => {
  if (!doc) return false;
  const { $or, ...rest } = filter;
  if (!matchesCondition(doc, rest)) return false;
  if ($or) return $or.some((cond) => matchesCondition(doc, cond));
  return true;
};

const applyUpdate = (doc, update) => {
  const next = { ...doc };
  if (update.$set) Object.assign(next, update.$set);
  if (update.$inc) {
    Object.entries(update.$inc).forEach(([key, amount]) => {
      next[key] = (next[key] || 0) + amount;
    });
  }
  return next;
};

const makeFakeDeletionStore = (initialDoc) => {
  let doc = { ...initialDoc };
  return {
    getDoc: () => doc,
    // Simulates real time passing without needing fake timers: pushes the
    // current claim's lease timestamp far enough into the past that a
    // SECOND worker's `findOneAndUpdate` stale-lease branch will match it,
    // while the record otherwise still looks exactly like an in-flight
    // claim (same status/processingClaimId) to whichever worker already
    // holds it.
    expireLease: () => {
      doc = { ...doc, processingClaimedAt: new Date(Date.now() - 10 * 60 * 1000) };
    },
    find: jest.fn(() => ({ limit: jest.fn().mockResolvedValue(doc ? [{ ...doc }] : []) })),
    findOneAndUpdate: jest.fn((filter, update) => {
      if (!matchesFilter(doc, filter)) return Promise.resolve(null);
      doc = applyUpdate(doc, update);
      return Promise.resolve({ ...doc });
    }),
    updateOne: jest.fn((filter, update) => {
      const matched = matchesFilter(doc, filter);
      if (matched) doc = applyUpdate(doc, update);
      // Mirrors real Mongoose: modifiedCount is 0 when the filter (e.g. an
      // expired/superseded processingClaimId) matches nothing, letting
      // callers detect a lost claim instead of assuming their write landed.
      return Promise.resolve({ matchedCount: matched ? 1 : 0, modifiedCount: matched ? 1 : 0 });
    }),
  };
};

describe("faceReference.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, ...baseEnv };
    FaceReferenceAudit.countDocuments.mockResolvedValue(0);
    // Default: every retire+persist-deletion transaction commits normally.
    // Individual tests override this with makeFailingDbSession() to
    // simulate a MongoDB failure during that exact transaction.
    jest.spyOn(mongoose, "startSession").mockImplementation(async () => makeDbSession());
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

    it("retires a previously active reference into its OWN independent deletion record instead of accumulating faces (no orphaned vector, no shared document)", async () => {
      const service = loadService();
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      const oldEncrypted = encryptFaceId("old-face-id", KEY);
      // findOne({userId, status:"active"}) locates the previous reference.
      FaceReference.findOne.mockResolvedValue({
        _id: "old-ref-1",
        userId: USER_ID,
        status: "active",
        collectionId: "meetyoulive-photo-verification",
        encryptedFaceId: oldEncrypted,
      });
      // retireActiveReference's findOneAndUpdate returns the PRE-update doc
      // (new:false), i.e. still carrying the OLD collectionId/encryptedFaceId.
      FaceReference.findOneAndUpdate
        .mockResolvedValueOnce({
          _id: "old-ref-1",
          userId: USER_ID,
          collectionId: "meetyoulive-photo-verification",
          encryptedFaceId: oldEncrypted,
        })
        // The upsert for the NEW reference.
        .mockResolvedValueOnce({ _id: "ref-1" });
      mockDeletionCreated({ encryptedFaceId: oldEncrypted, reason: "replaced" });
      FaceReferenceDeletion.findOneAndUpdate.mockResolvedValue({
        _id: "deletion-1",
        collectionId: "meetyoulive-photo-verification",
        encryptedFaceId: oldEncrypted,
      });
      rekognitionClient.ensureCollection.mockResolvedValue();
      rekognitionClient.indexFace.mockResolvedValue({ faceId: "new-face-id", faceCount: 1 });
      rekognitionClient.deleteFaces.mockResolvedValue();

      const result = await service.saveFaceReferenceFromVerifiedSession({
        userId: USER_ID,
        imageBytes: Buffer.from("bytes"),
      });

      expect(result).toEqual({ saved: true });
      // A fully independent deletion record was created for the OLD face —
      // never fields reused on the same per-user FaceReference document.
      expect(FaceReferenceDeletion.create).toHaveBeenCalledWith(
        [expect.objectContaining({ userId: USER_ID, collectionId: "meetyoulive-photo-verification", reason: "replaced" })],
        expect.objectContaining({ session: expect.anything() })
      );
      expect(rekognitionClient.deleteFaces).toHaveBeenCalledWith("meetyoulive-photo-verification", ["old-face-id"]);
      // The NEW reference's own upsert never touches the old face's id.
      const upsertCall = FaceReference.findOneAndUpdate.mock.calls[1];
      expect(upsertCall[1].$set.encryptedFaceId).not.toContain("old-face-id");
    });

    it("CONCURRENCY: reference replacement while an older deletion for the same user is still pending never corrupts the new reference", async () => {
      // Scenario: a previous revoke already scheduled (but not yet
      // confirmed) deletion of face A. Before it confirms, the user
      // re-verifies and a NEW reference (face B) must be created safely —
      // the pending deletion of A must be completely unaffected.
      const service = loadService();
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      const encryptedA = encryptFaceId("face-a", KEY);
      FaceReference.findOne.mockResolvedValue(null); // no ACTIVE reference right now (A was already revoked)
      FaceReference.findOneAndUpdate.mockResolvedValue({ _id: "ref-new" });
      rekognitionClient.ensureCollection.mockResolvedValue();
      rekognitionClient.indexFace.mockResolvedValue({ faceId: "face-b", faceCount: 1 });

      const result = await service.saveFaceReferenceFromVerifiedSession({
        userId: USER_ID,
        imageBytes: Buffer.from("bytes-b"),
      });

      expect(result).toEqual({ saved: true });
      // Creating the new reference must NEVER touch FaceReferenceDeletion at
      // all when there was no active reference to retire.
      expect(FaceReferenceDeletion.create).not.toHaveBeenCalled();
      const upsertCall = FaceReference.findOneAndUpdate.mock.calls[0];
      expect(upsertCall[1].$set.encryptedFaceId).not.toContain("face-a");
      expect(upsertCall[1].$set.encryptedFaceId).not.toBe(encryptedA);
    });

    it("CONCURRENCY: if MongoDB fails AFTER IndexFaces succeeds, the orphaned AWS vector is compensated (deleted)", async () => {
      const service = loadService();
      FaceReference.findOne.mockResolvedValue(null);
      rekognitionClient.ensureCollection.mockResolvedValue();
      rekognitionClient.indexFace.mockResolvedValue({ faceId: "orphan-face-id", faceCount: 1 });
      // The upsert for the NEW reference throws (simulated Mongo outage).
      FaceReference.findOneAndUpdate.mockRejectedValue(new Error("Mongo write failed"));
      rekognitionClient.deleteFaces.mockResolvedValue();

      const result = await service.saveFaceReferenceFromVerifiedSession({
        userId: USER_ID,
        imageBytes: Buffer.from("bytes"),
      });

      expect(result).toEqual({ saved: false, reasonCode: "SAVE_FAILED" });
      // Compensation: the vector IndexFaces just created must be deleted so
      // it is never left as an orphan with zero local tracking.
      expect(rekognitionClient.deleteFaces).toHaveBeenCalledWith(
        "meetyoulive-photo-verification",
        ["orphan-face-id"]
      );
    });

    it("CONCURRENCY: if the orphaned-vector compensation delete ALSO fails, a durable recovery record is still created (never silently lost, never thrown)", async () => {
      const service = loadService();
      FaceReference.findOne.mockResolvedValue(null);
      rekognitionClient.ensureCollection.mockResolvedValue();
      rekognitionClient.indexFace.mockResolvedValue({ faceId: "orphan-face-id", faceCount: 1 });
      FaceReference.findOneAndUpdate.mockRejectedValue(new Error("Mongo write failed"));
      rekognitionClient.deleteFaces.mockRejectedValue(new Error("AWS also down"));
      // The last-resort durable recovery record succeeds (plain object
      // create, no transaction/session — a separate, standalone write).
      FaceReferenceDeletion.create.mockResolvedValueOnce({ _id: "recovery-1" });
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      await expect(
        service.saveFaceReferenceFromVerifiedSession({ userId: USER_ID, imageBytes: Buffer.from("bytes") })
      ).resolves.toEqual({ saved: false, reasonCode: "SAVE_FAILED" });

      // A standalone, durable FaceReferenceDeletion record was persisted for
      // the orphaned vector so the background retry job can still clean it
      // up — this call is a single object (no session), unlike the
      // transactional retire+persist calls elsewhere which pass an array.
      expect(FaceReferenceDeletion.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID, reason: "orphaned_index" })
      );
      // Never claims the deletion is confirmed — it is only scheduled.
      expect(FaceReferenceDeletion.create.mock.calls[0][0]).not.toHaveProperty("status", "confirmed");

      errorSpy.mockRestore();
    });

    it("CONCURRENCY: if BOTH the compensation delete AND the durable recovery-record write fail, the failure is reported as unrecoverable — never as a silent success", async () => {
      const service = loadService();
      FaceReference.findOne.mockResolvedValue(null);
      rekognitionClient.ensureCollection.mockResolvedValue();
      rekognitionClient.indexFace.mockResolvedValue({ faceId: "orphan-face-id", faceCount: 1 });
      FaceReference.findOneAndUpdate.mockRejectedValue(new Error("Mongo write failed"));
      rekognitionClient.deleteFaces.mockRejectedValue(new Error("AWS also down"));
      // Every attempt to persist the recovery record also fails.
      FaceReferenceDeletion.create.mockRejectedValue(new Error("Mongo still down"));
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      const result = await service.saveFaceReferenceFromVerifiedSession({
        userId: USER_ID,
        imageBytes: Buffer.from("bytes"),
      });

      expect(result).toEqual({ saved: false, reasonCode: "ORPHANED_VECTOR_UNRECOVERABLE" });
      // A distinguishable CRITICAL log was emitted making clear cleanup is
      // NOT guaranteed (never silently implying success).
      const criticalLogs = errorSpy.mock.calls.filter((call) =>
        String(call[0] || "").includes("CRITICAL") && String(call[0] || "").includes("NOT guaranteed")
      );
      expect(criticalLogs.length).toBeGreaterThan(0);
      // Never logs the raw/decrypted FaceId anywhere, including this path.
      errorSpy.mock.calls.forEach((call) => {
        expect(JSON.stringify(call)).not.toContain("orphan-face-id");
      });

      errorSpy.mockRestore();
    });

    it("CONCURRENCY: if MongoDB fails to persist the OLD reference's pending-deletion record (retire+persist transaction), the OLD reference is left UNCHANGED and the new one is never created (no orphan, nothing overwritten)", async () => {
      const service = loadService();
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      const oldEncrypted = encryptFaceId("old-face-id", KEY);
      FaceReference.findOne.mockResolvedValue({
        _id: "old-ref-1",
        userId: USER_ID,
        status: "active",
        collectionId: "meetyoulive-photo-verification",
        encryptedFaceId: oldEncrypted,
      });
      // The whole retire+persist transaction fails every attempt (simulated
      // MongoDB outage), regardless of how many times it is retried.
      jest.spyOn(mongoose, "startSession").mockImplementation(async () => makeFailingDbSession());
      rekognitionClient.ensureCollection.mockResolvedValue();
      rekognitionClient.indexFace.mockResolvedValue({ faceId: "new-face-id", faceCount: 1 });
      rekognitionClient.deleteFaces.mockResolvedValue();
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      const result = await service.saveFaceReferenceFromVerifiedSession({
        userId: USER_ID,
        imageBytes: Buffer.from("bytes"),
      });

      expect(result).toEqual({ saved: false, reasonCode: "RETIRE_OLD_REFERENCE_FAILED" });
      // The OLD reference's document is never touched by this failed path —
      // no upsert of the new face ever happens, so the old one stays active
      // and fully trackable (nothing silently overwritten/lost).
      expect(FaceReference.findOneAndUpdate).not.toHaveBeenCalled();
      // The NEW vector that was already indexed in AWS before the failure
      // must be compensated (deleted) rather than left orphaned.
      expect(rekognitionClient.deleteFaces).toHaveBeenCalledWith("meetyoulive-photo-verification", ["new-face-id"]);
      errorSpy.mockRestore();
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

    it("returns no_reference when the user never consented / has no reference (also covers an already-deleted reference)", async () => {
      const service = loadService();
      FaceReference.findOne.mockResolvedValue(null);
      const result = await service.compareAgainstReference({ userId: USER_ID, newPhotoUrl: "https://a/b.jpg" });
      expect(result.status).toBe("no_reference");
    });

    it("returns no_reference for an expired reference even if status is still active, and schedules its AWS deletion as an independent record", async () => {
      const service = loadService();
      FaceReference.findOne.mockResolvedValue({
        _id: "ref-1",
        userId: USER_ID,
        status: "active",
        collectionId: "col",
        encryptedFaceId: "enc",
        retentionExpiresAt: new Date(Date.now() - 1000),
      });
      FaceReference.findOneAndUpdate.mockResolvedValue({
        _id: "ref-1",
        userId: USER_ID,
        collectionId: "col",
        encryptedFaceId: "enc",
      });
      mockDeletionCreated({ reason: "expired" });
      FaceReferenceDeletion.findOneAndUpdate.mockResolvedValue({ _id: "deletion-1", collectionId: "col", encryptedFaceId: "enc" });
      const result = await service.compareAgainstReference({ userId: USER_ID, newPhotoUrl: "https://a/b.jpg" });
      expect(result.status).toBe("no_reference");
      await new Promise((resolve) => setImmediate(resolve));
      expect(FaceReference.findOneAndUpdate).toHaveBeenCalled();
    });

    it("never reuses a revoked/retired reference (DB query itself excludes non-active status)", async () => {
      const service = loadService();
      FaceReference.findOne.mockResolvedValue(null);
      const result = await service.compareAgainstReference({ userId: USER_ID, newPhotoUrl: "https://a/b.jpg" });
      expect(result.status).toBe("no_reference");
      expect(FaceReference.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ status: "active", consentWithdrawnAt: null })
      );
    });

    it("DELETE + RE-REGISTER: a new account (new userId) never inherits the deleted account's active face reference, even with the same email", async () => {
      const service = loadService();
      const OLD_USER_ID = "507f1f77bcf86cd799439099";
      const NEW_USER_ID = "507f1f77bcf86cd799439100"; // different _id — same real-world person/email
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      const activeReferenceForOldAccount = {
        _id: "ref-old",
        userId: OLD_USER_ID,
        status: "active",
        consentWithdrawnAt: null,
        collectionId: "meetyoulive-photo-verification",
        encryptedFaceId: encryptFaceId("old-face-id", KEY),
        retentionExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
      };
      // Mirrors real Mongo: `FaceReference.findOne({ userId, ... })` only
      // ever matches the EXACT userId passed in — never by email, and
      // never any other user's document.
      FaceReference.findOne.mockImplementation(async (query) =>
        query.userId === OLD_USER_ID ? activeReferenceForOldAccount : null
      );

      // Step 1: the account is deleted — its reference is retired/scheduled
      // for AWS deletion (covered in detail by revokeFaceReferenceForAccountDeletion
      // tests below). Here we only need the lookup-by-userId guarantee.
      const newAccountDecision = await service.compareAgainstReference({
        userId: NEW_USER_ID,
        newPhotoUrl: "https://cdn.example.com/new-account-selfie.jpg",
      });

      expect(newAccountDecision).toEqual({ status: "no_reference", reasonCode: "NO_REFERENCE" });
      expect(FaceReference.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ userId: NEW_USER_ID })
      );
      // The old account's reference was looked at (by its own id) but never
      // leaked into the new account's decision.
      expect(FaceReference.findOne).not.toHaveBeenCalledWith(
        expect.objectContaining({ userId: NEW_USER_ID, email: expect.anything() })
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
      FaceReference.findOneAndUpdate.mockResolvedValue({ _id: "ref-1", status: "active" });

      const result = await service.compareAgainstReference({ userId: USER_ID, newPhotoUrl: "https://a/new.jpg" });
      expect(result).toEqual({ status: "verified", reasonCode: "MATCH" });
      // The fail-closed re-check is the ONLY write allowed right before
      // confirming "verified" — conditioned on status still being active.
      expect(FaceReference.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: "ref-1", status: "active", consentWithdrawnAt: null },
        expect.objectContaining({ $set: expect.objectContaining({ lastUsedAt: expect.any(Date) }) }),
        { new: true }
      );
    });

    it("accepts pre-fetched imageBytes directly, skipping the download entirely (e.g. a buffer validated before upload)", async () => {
      const service = loadService();
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      FaceReference.findOne.mockResolvedValue({
        _id: "ref-1",
        status: "active",
        collectionId: "meetyoulive-photo-verification",
        encryptedFaceId: encryptFaceId("stored-face-id", KEY),
        retentionExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });
      rekognitionClient.searchFacesByImage.mockResolvedValue({ faceId: "stored-face-id", similarity: 99 });
      FaceReference.findOneAndUpdate.mockResolvedValue({ _id: "ref-1", status: "active" });

      const preFetchedBytes = Buffer.from([9, 9, 9]);
      const result = await service.compareAgainstReference({ userId: USER_ID, imageBytes: preFetchedBytes });

      expect(result).toEqual({ status: "verified", reasonCode: "MATCH" });
      expect(secureImageFetch.downloadVerifiedImageBytes).not.toHaveBeenCalled();
      expect(rekognitionClient.searchFacesByImage).toHaveBeenCalledWith(
        "meetyoulive-photo-verification",
        preFetchedBytes
      );
    });

    it("CONCURRENCY: consent revoked DURING the AWS comparison must fail closed and never grant the badge", async () => {
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
      // Simulates a concurrent revoke that already flipped status away from
      // "active" by the time this conditional re-check write runs.
      FaceReference.findOneAndUpdate.mockResolvedValue(null);

      const result = await service.compareAgainstReference({ userId: USER_ID, newPhotoUrl: "https://a/new.jpg" });
      expect(result).toEqual({ status: "no_reference", reasonCode: "REVOKED_DURING_COMPARISON" });
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

    it("never auto-approves on AWS/network errors (AWS unavailability) — falls back to requiring a new selfie", async () => {
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
      expect(FaceReferenceDeletion.create).not.toHaveBeenCalled();
    });

    it("atomically retires the active reference into an independent deletion record, deletes the AWS face, and confirms it", async () => {
      const service = loadService();
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      const encrypted = encryptFaceId("stored-face-id", KEY);
      // retireActiveReference's findOneAndUpdate returns the PRE-update doc.
      FaceReference.findOneAndUpdate.mockResolvedValue({
        _id: "ref-1",
        userId: USER_ID,
        collectionId: "meetyoulive-photo-verification",
        encryptedFaceId: encrypted,
      });
      mockDeletionCreated({ encryptedFaceId: encrypted, reason: "revoked" });
      FaceReferenceDeletion.findOneAndUpdate.mockResolvedValue({
        _id: "deletion-1",
        collectionId: "meetyoulive-photo-verification",
        encryptedFaceId: encrypted,
      });
      rekognitionClient.deleteFaces.mockResolvedValue();
      FaceReferenceDeletion.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

      const result = await service.revokeFaceReference(USER_ID, { ip: "1.2.3.4" });
      expect(result).toEqual({ revoked: true, deletionConfirmed: true });
      expect(rekognitionClient.deleteFaces).toHaveBeenCalledWith("meetyoulive-photo-verification", [
        "stored-face-id",
      ]);
      // The claim itself moves status OUT of "active" immediately, filtered
      // on the SAME status — never used for a comparison again regardless
      // of the AWS outcome below.
      const [filter, update] = FaceReference.findOneAndUpdate.mock.calls[0];
      expect(filter).toEqual({ userId: USER_ID, status: "active" });
      expect(update.$set.status).toBe("revoked");
      // A fully independent FaceReferenceDeletion record captures the
      // vector that still needs AWS-side deletion.
      expect(FaceReferenceDeletion.create).toHaveBeenCalledWith(
        [expect.objectContaining({ userId: USER_ID, collectionId: "meetyoulive-photo-verification", reason: "revoked" })],
        expect.objectContaining({ session: expect.anything() })
      );
      // Final confirmation settles the INDEPENDENT deletion record, never
      // the (already-reusable) FaceReference document — and is conditioned
      // on this worker's own claim id, not just the record's `_id`.
      expect(FaceReferenceDeletion.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({ _id: "deletion-1", status: "processing", processingClaimId: expect.any(String) }),
        expect.objectContaining({ $set: expect.objectContaining({ status: "confirmed" }) })
      );
    });

    it("reports revoked:true locally but deletionConfirmed:false and schedules a retry when the AWS delete fails", async () => {
      const service = loadService();
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      const encrypted = encryptFaceId("stored-face-id", KEY);
      FaceReference.findOneAndUpdate.mockResolvedValue({
        _id: "ref-1",
        userId: USER_ID,
        collectionId: "meetyoulive-photo-verification",
        encryptedFaceId: encrypted,
      });
      mockDeletionCreated({ encryptedFaceId: encrypted, reason: "revoked" });
      FaceReferenceDeletion.findOneAndUpdate.mockResolvedValue({
        _id: "deletion-1",
        collectionId: "meetyoulive-photo-verification",
        encryptedFaceId: encrypted,
      });
      rekognitionClient.deleteFaces.mockRejectedValue(new Error("AWS down"));

      const result = await service.revokeFaceReference(USER_ID, {});
      expect(result).toEqual({ revoked: true, deletionConfirmed: false });
      // The failed attempt is tracked on the INDEPENDENT deletion record
      // (never silently dropped) so a retry job can safely pick it back up,
      // conditioned on this worker's own claim id.
      expect(FaceReferenceDeletion.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({ _id: "deletion-1", status: "processing", processingClaimId: expect.any(String) }),
        expect.objectContaining({ $set: expect.objectContaining({ lastError: expect.any(String) }) })
      );
      // Never informs success as if AWS had confirmed it.
      expect(FaceReferenceDeletion.updateOne).not.toHaveBeenCalledWith(
        expect.objectContaining({ _id: "deletion-1" }),
        expect.objectContaining({ $set: expect.objectContaining({ status: "confirmed" }) })
      );
    });

    it("never logs the raw FaceId/encrypted payload when a deletion attempt fails", async () => {
      const service = loadService();
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      const encrypted = encryptFaceId("super-secret-face-id", KEY);
      FaceReference.findOneAndUpdate.mockResolvedValue({
        _id: "ref-1",
        userId: USER_ID,
        collectionId: "meetyoulive-photo-verification",
        encryptedFaceId: encrypted,
      });
      mockDeletionCreated({ encryptedFaceId: encrypted, reason: "revoked" });
      FaceReferenceDeletion.findOneAndUpdate.mockResolvedValue({
        _id: "deletion-1",
        collectionId: "meetyoulive-photo-verification",
        encryptedFaceId: encrypted,
      });
      rekognitionClient.deleteFaces.mockRejectedValue(new Error("AWS down"));
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      await service.revokeFaceReference(USER_ID, {});

      const loggedText = errorSpy.mock.calls.map((args) => args.join(" ")).join("\n");
      expect(loggedText).not.toContain("super-secret-face-id");
      expect(loggedText).not.toContain(encrypted);
      errorSpy.mockRestore();
    });

    it("CONCURRENCY: two simultaneous revoke calls for the same user never both trigger an AWS delete (only one claims the active reference)", async () => {
      const service = loadService();
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      const encrypted = encryptFaceId("stored-face-id", KEY);
      // First caller's atomic claim succeeds; the second's conditional
      // findOneAndUpdate (same filter `{userId, status:"active"}`) can no
      // longer match anything and MUST return null.
      FaceReference.findOneAndUpdate
        .mockResolvedValueOnce({
          _id: "ref-1",
          userId: USER_ID,
          collectionId: "meetyoulive-photo-verification",
          encryptedFaceId: encrypted,
        })
        .mockResolvedValueOnce(null);
      mockDeletionCreated({ encryptedFaceId: encrypted, reason: "revoked" });
      FaceReferenceDeletion.findOneAndUpdate.mockResolvedValue({
        _id: "deletion-1",
        collectionId: "meetyoulive-photo-verification",
        encryptedFaceId: encrypted,
      });
      rekognitionClient.deleteFaces.mockResolvedValue();

      const [resultA, resultB] = await Promise.all([
        service.revokeFaceReference(USER_ID, {}),
        service.revokeFaceReference(USER_ID, {}),
      ]);

      const results = [resultA, resultB];
      const revokedCount = results.filter((r) => r.revoked).length;
      const noopCount = results.filter((r) => !r.revoked).length;
      expect(revokedCount).toBe(1);
      expect(noopCount).toBe(1);
      expect(rekognitionClient.deleteFaces).toHaveBeenCalledTimes(1);
      expect(FaceReferenceDeletion.create).toHaveBeenCalledTimes(1);
    });

    it("CONCURRENCY: when MongoDB fails to persist the pending-deletion record, the reference is reported as NOT revoked and remains unchanged (never claims success while losing the recoverable FaceId)", async () => {
      const service = loadService();
      // The retire+persist transaction fails on every retry attempt.
      jest.spyOn(mongoose, "startSession").mockImplementation(async () => makeFailingDbSession());
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      const result = await service.revokeFaceReference(USER_ID, { ip: "1.2.3.4" });

      expect(result).toEqual({ revoked: false, failed: true, reasonCode: "TRANSACTION_FAILED" });
      // AWS must never even be contacted — nothing was durably retired yet.
      expect(rekognitionClient.deleteFaces).not.toHaveBeenCalled();
      expect(FaceReferenceDeletion.create).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it("CONCURRENCY: two simultaneous revoke calls where one hits a MongoDB failure never corrupts the other's successful revoke+deletion record", async () => {
      const service = loadService();
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      const encrypted = encryptFaceId("stored-face-id", KEY);
      let call = 0;
      // First call's whole transaction succeeds; the second (racing) call's
      // transaction fails (e.g. a transient write conflict) — it must be
      // reported as failed, never as a successful revoke of someone else's
      // already-completed retirement.
      jest.spyOn(mongoose, "startSession").mockImplementation(async () => {
        call += 1;
        return call === 1 ? makeDbSession() : makeFailingDbSession();
      });
      FaceReference.findOneAndUpdate.mockResolvedValueOnce({
        _id: "ref-1",
        userId: USER_ID,
        collectionId: "meetyoulive-photo-verification",
        encryptedFaceId: encrypted,
      });
      mockDeletionCreated({ encryptedFaceId: encrypted, reason: "revoked" });
      FaceReferenceDeletion.findOneAndUpdate.mockResolvedValue({
        _id: "deletion-1",
        collectionId: "meetyoulive-photo-verification",
        encryptedFaceId: encrypted,
      });
      rekognitionClient.deleteFaces.mockResolvedValue();
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      const [resultA, resultB] = await Promise.all([
        service.revokeFaceReference(USER_ID, {}),
        service.revokeFaceReference(USER_ID, {}),
      ]);

      const results = [resultA, resultB];
      expect(results.filter((r) => r.revoked === true)).toHaveLength(1);
      expect(results.filter((r) => r.failed === true)).toHaveLength(1);
      expect(rekognitionClient.deleteFaces).toHaveBeenCalledTimes(1);
      errorSpy.mockRestore();
    });
  });

  describe("retryPendingFaceReferenceDeletions", () => {
    it("retries every pending FaceReferenceDeletion record and reports confirmed vs still-pending counts", async () => {
      const service = loadService();
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      FaceReferenceDeletion.find.mockReturnValue({
        limit: jest.fn().mockResolvedValue([
          { _id: "del-ok", status: "pending", collectionId: "col", encryptedFaceId: encryptFaceId("face-ok", KEY) },
          { _id: "del-still-failing", status: "pending", collectionId: "col", encryptedFaceId: encryptFaceId("face-fail", KEY) },
        ]),
      });
      FaceReferenceDeletion.findOneAndUpdate.mockImplementation(({ _id }) => {
        if (_id === "del-ok") return Promise.resolve({ _id: "del-ok", collectionId: "col", encryptedFaceId: encryptFaceId("face-ok", KEY) });
        return Promise.resolve({ _id: "del-still-failing", collectionId: "col", encryptedFaceId: encryptFaceId("face-fail", KEY) });
      });
      rekognitionClient.deleteFaces.mockImplementation(async (col, [faceId]) => {
        if (faceId === "face-fail") throw new Error("still down");
      });
      FaceReferenceDeletion.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

      const result = await service.retryPendingFaceReferenceDeletions();
      expect(result).toEqual({ processed: 2, confirmed: 1, stillPending: 1 });
      // The job must also pick up records stuck in "processing" whose lease
      // has gone stale (an interrupted previous attempt) — not ONLY plain
      // "pending" ones.
      const [queryFilter] = FaceReferenceDeletion.find.mock.calls[0];
      expect(queryFilter.$or).toEqual(
        expect.arrayContaining([
          { status: "pending" },
          expect.objectContaining({ status: "processing" }),
        ])
      );
    });

    it("CONCURRENCY: two simultaneous workers racing the SAME pending record — only one actually claims it and calls AWS DeleteFaces (real atomic claim, not a scripted winner)", async () => {
      const service = loadService();
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      const encrypted = encryptFaceId("face-1", KEY);
      const store = makeFakeDeletionStore({
        _id: "del-1",
        status: "pending",
        collectionId: "col",
        encryptedFaceId: encrypted,
        attempts: 0,
        processingClaimedAt: null,
      });
      FaceReferenceDeletion.find.mockImplementation(store.find);
      FaceReferenceDeletion.findOneAndUpdate.mockImplementation(store.findOneAndUpdate);
      FaceReferenceDeletion.updateOne.mockImplementation(store.updateOne);
      rekognitionClient.deleteFaces.mockResolvedValue();

      const [resultA, resultB] = await Promise.all([
        service.retryPendingFaceReferenceDeletions(),
        service.retryPendingFaceReferenceDeletions(),
      ]);

      // Exactly one of the two actually ran the AWS call and confirmed it;
      // the other found the record already claimed (status flipped to
      // "processing" by the winner) and reported ALREADY_PROCESSED.
      expect(rekognitionClient.deleteFaces).toHaveBeenCalledTimes(1);
      expect(resultA.confirmed + resultB.confirmed).toBe(1);
      expect(resultA.stillPending + resultB.stillPending).toBe(1);
      // The record itself ends up durably "confirmed" — never left dangling
      // in "processing" after a successful AWS call.
      expect(store.getDoc().status).toBe("confirmed");
      expect(store.getDoc().processingClaimedAt).toBeNull();
    });

    it("when AWS DeleteFaces fails, the exclusive claim is released back to 'pending' (never stuck in 'processing') and the encrypted FaceId is preserved for a future retry", async () => {
      const service = loadService();
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      const encrypted = encryptFaceId("face-1", KEY);
      const store = makeFakeDeletionStore({
        _id: "del-1",
        status: "pending",
        collectionId: "col",
        encryptedFaceId: encrypted,
        attempts: 0,
        processingClaimedAt: null,
      });
      FaceReferenceDeletion.find.mockImplementation(store.find);
      FaceReferenceDeletion.findOneAndUpdate.mockImplementation(store.findOneAndUpdate);
      FaceReferenceDeletion.updateOne.mockImplementation(store.updateOne);
      rekognitionClient.deleteFaces.mockRejectedValue(new Error("AWS down"));

      const result = await service.retryPendingFaceReferenceDeletions();

      expect(result).toEqual({ processed: 1, confirmed: 0, stillPending: 1 });
      expect(store.getDoc().status).toBe("pending"); // claim released, not left as "processing"
      expect(store.getDoc().processingClaimedAt).toBeNull();
      expect(store.getDoc().encryptedFaceId).toBe(encrypted); // never lost/overwritten
      expect(store.getDoc().lastError).toEqual(expect.any(String));
    });

    it("CONCURRENCY: a record left stuck in 'processing' by a crashed/interrupted worker is automatically recovered once its lease expires", async () => {
      const service = loadService();
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      const encrypted = encryptFaceId("face-1", KEY);
      const staleClaim = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago — well past the lease window
      const store = makeFakeDeletionStore({
        _id: "del-1",
        status: "processing",
        collectionId: "col",
        encryptedFaceId: encrypted,
        attempts: 1,
        processingClaimedAt: staleClaim,
      });
      FaceReferenceDeletion.find.mockImplementation(store.find);
      FaceReferenceDeletion.findOneAndUpdate.mockImplementation(store.findOneAndUpdate);
      FaceReferenceDeletion.updateOne.mockImplementation(store.updateOne);
      rekognitionClient.deleteFaces.mockResolvedValue();

      const result = await service.retryPendingFaceReferenceDeletions();

      expect(result).toEqual({ processed: 1, confirmed: 1, stillPending: 0 });
      expect(rekognitionClient.deleteFaces).toHaveBeenCalledWith("col", ["face-1"]);
      expect(store.getDoc().status).toBe("confirmed");
    });

    it("defense in depth: even if a NON-stale 'processing' record is among the candidates, attemptPendingDeletion's own claim still declines it — an alive worker's lease is never preempted", async () => {
      const service = loadService();
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      const encrypted = encryptFaceId("face-1", KEY);
      const freshClaim = new Date(); // just claimed, still well within the lease window
      const store = makeFakeDeletionStore({
        _id: "del-1",
        status: "processing",
        collectionId: "col",
        encryptedFaceId: encrypted,
        attempts: 1,
        processingClaimedAt: freshClaim,
      });
      FaceReferenceDeletion.find.mockImplementation(store.find);
      FaceReferenceDeletion.findOneAndUpdate.mockImplementation(store.findOneAndUpdate);
      FaceReferenceDeletion.updateOne.mockImplementation(store.updateOne);

      const result = await service.retryPendingFaceReferenceDeletions();

      expect(result).toEqual({ processed: 1, confirmed: 0, stillPending: 1 });
      expect(rekognitionClient.deleteFaces).not.toHaveBeenCalled();
      expect(store.getDoc().status).toBe("processing"); // left untouched, claim not stolen
      expect(store.getDoc().processingClaimedAt).toEqual(freshClaim);
    });

    it("CONCURRENCY: worker A's lease expires while AWS is slow to respond; worker B reclaims and confirms first; A's late (successful) AWS response can never overwrite B's confirmed state", async () => {
      const service = loadService();
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      const encrypted = encryptFaceId("face-1", KEY);
      const store = makeFakeDeletionStore({
        _id: "del-1",
        status: "pending",
        collectionId: "col",
        encryptedFaceId: encrypted,
        attempts: 0,
        processingClaimedAt: null,
      });
      FaceReferenceDeletion.find.mockImplementation(store.find);
      FaceReferenceDeletion.findOneAndUpdate.mockImplementation(store.findOneAndUpdate);
      FaceReferenceDeletion.updateOne.mockImplementation(store.updateOne);

      // Worker A's AWS call hangs until we manually resolve it below — by
      // which time worker B has ALREADY reclaimed and fully confirmed the
      // very same record. A's own `deleteFaces` call resolves successfully,
      // but its late write must never be allowed to overwrite B's result.
      let resolveAwsForA;
      let awsStartedResolve;
      const awsStarted = new Promise((resolve) => {
        awsStartedResolve = resolve;
      });
      let awsCalls = 0;
      rekognitionClient.deleteFaces.mockImplementation(() => {
        awsCalls += 1;
        if (awsCalls === 1) {
          awsStartedResolve();
          return new Promise((resolve) => {
            resolveAwsForA = resolve;
          });
        }
        return Promise.resolve();
      });

      // Worker A claims the record and calls AWS (hangs).
      const workerAPromise = service.retryPendingFaceReferenceDeletions();
      await awsStarted; // A's claim + AWS call have definitely happened by now.
      expect(store.getDoc().status).toBe("processing");

      // Simulate real time passing: A's lease is now stale (it is still
      // "waiting" on the hung AWS promise above, exactly like a crashed or
      // stalled worker would appear to a fresh retry pass).
      store.expireLease();

      // Worker B runs an independent retry pass, reclaims the SAME record
      // (fresh processingClaimId of its own), successfully calls AWS, and
      // confirms it — entirely before A's hung AWS call ever resolves.
      const resultB = await service.retryPendingFaceReferenceDeletions();
      expect(resultB).toEqual({ processed: 1, confirmed: 1, stillPending: 0 });
      expect(store.getDoc().status).toBe("confirmed");

      // Only now does A's original (stale) AWS call finally resolve.
      resolveAwsForA();
      const resultA = await workerAPromise;

      // A must NOT report success for a claim it no longer holds, and must
      // NOT have mutated the record B already confirmed.
      expect(resultA).toEqual({ processed: 1, confirmed: 0, stillPending: 1 });
      expect(store.getDoc().status).toBe("confirmed"); // untouched by A
      expect(store.getDoc().processingClaimId).toBeNull();
      expect(store.getDoc().processingClaimedAt).toBeNull();
      expect(rekognitionClient.deleteFaces).toHaveBeenCalledTimes(2);
    });

    it("CONCURRENCY (inverse): worker B confirms the record first; worker A's late AWS FAILURE can never revert B's 'confirmed' status back to 'pending'", async () => {
      const service = loadService();
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      const encrypted = encryptFaceId("face-1", KEY);
      const store = makeFakeDeletionStore({
        _id: "del-1",
        status: "pending",
        collectionId: "col",
        encryptedFaceId: encrypted,
        attempts: 0,
        processingClaimedAt: null,
      });
      FaceReferenceDeletion.find.mockImplementation(store.find);
      FaceReferenceDeletion.findOneAndUpdate.mockImplementation(store.findOneAndUpdate);
      FaceReferenceDeletion.updateOne.mockImplementation(store.updateOne);

      // Worker A's AWS call hangs, then ultimately FAILS (e.g. a transient
      // network error) — well after worker B has already reclaimed and
      // confirmed the record.
      let rejectAwsForA;
      let awsStartedResolve;
      const awsStarted = new Promise((resolve) => {
        awsStartedResolve = resolve;
      });
      let awsCalls = 0;
      rekognitionClient.deleteFaces.mockImplementation(() => {
        awsCalls += 1;
        if (awsCalls === 1) {
          awsStartedResolve();
          return new Promise((_resolve, reject) => {
            rejectAwsForA = reject;
          });
        }
        return Promise.resolve();
      });

      const workerAPromise = service.retryPendingFaceReferenceDeletions();
      await awsStarted;
      expect(store.getDoc().status).toBe("processing");

      store.expireLease();

      const resultB = await service.retryPendingFaceReferenceDeletions();
      expect(resultB).toEqual({ processed: 1, confirmed: 1, stillPending: 0 });
      expect(store.getDoc().status).toBe("confirmed");

      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      rejectAwsForA(new Error("AWS down"));
      const resultA = await workerAPromise;
      errorSpy.mockRestore();

      // A's failure-release write must be a no-op: B's "confirmed" record
      // must never be reverted to "pending" by a worker whose claim had
      // already been superseded.
      expect(resultA).toEqual({ processed: 1, confirmed: 0, stillPending: 1 });
      expect(store.getDoc().status).toBe("confirmed");
      expect(store.getDoc().processingClaimId).toBeNull();
      expect(store.getDoc().lastError).toBeUndefined();
    });
  });

  describe("revokeFaceReferenceForAccountDeletion", () => {
    it("schedules deletion of an active reference when an account is deleted", async () => {
      const service = loadService();
      const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
      const encrypted = encryptFaceId("face-1", KEY);
      FaceReference.findOneAndUpdate.mockResolvedValue({
        _id: "ref-1",
        userId: USER_ID,
        collectionId: "col",
        encryptedFaceId: encrypted,
      });
      mockDeletionCreated({ encryptedFaceId: encrypted, reason: "account_deleted" });
      FaceReferenceDeletion.findOneAndUpdate.mockResolvedValue({ _id: "deletion-1", collectionId: "col", encryptedFaceId: encrypted });
      rekognitionClient.deleteFaces.mockResolvedValue();

      const result = await service.revokeFaceReferenceForAccountDeletion(USER_ID);
      expect(result).toEqual({ scheduled: true });
      const [filter] = FaceReference.findOneAndUpdate.mock.calls[0];
      expect(filter).toEqual({ userId: USER_ID, status: "active" });
      expect(FaceReferenceDeletion.create).toHaveBeenCalledWith(
        [expect.objectContaining({ reason: "account_deleted" })],
        expect.objectContaining({ session: expect.anything() })
      );
    });

    it("is a no-op when there is nothing to delete", async () => {
      const service = loadService();
      FaceReference.findOneAndUpdate.mockResolvedValue(null);
      const result = await service.revokeFaceReferenceForAccountDeletion(USER_ID);
      expect(result).toEqual({ scheduled: false });
      expect(rekognitionClient.deleteFaces).not.toHaveBeenCalled();
    });

    it("CONCURRENCY: account deletion never falsely reports 'scheduled' when MongoDB fails to persist the pending deletion", async () => {
      const service = loadService();
      jest.spyOn(mongoose, "startSession").mockImplementation(async () => makeFailingDbSession());
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      const result = await service.revokeFaceReferenceForAccountDeletion(USER_ID);

      expect(result).toEqual({ scheduled: false, failed: true });
      expect(rekognitionClient.deleteFaces).not.toHaveBeenCalled();
      errorSpy.mockRestore();
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
