/**
 * Face reference service — the reusable "Perfil Auténtico" facial reference.
 *
 * This is NOT a second/parallel verification system. It extends the SAME
 * "Verificar mi foto" system (photoVerification.service.js) so that, after
 * an approved selfie and with separate explicit consent, a later primary
 * photo change can be re-checked against the existing reference instead of
 * demanding a brand-new selfie every time.
 *
 * Data-minimization choices:
 *   - No selfie image/video is ever persisted. The ONLY thing stored is an
 *     AES-256-GCM-encrypted copy of the opaque FaceId AWS Rekognition
 *     returns from IndexFaces into a dedicated Collection (a pointer into
 *     AWS's managed index, not a usable image or exportable vector).
 *   - The feature fails CLOSED at every step: if the encryption key is
 *     missing, if AWS is unavailable, if consent was never given, or if the
 *     reference is missing/expired/revoked, callers fall back to requiring
 *     a brand-new selfie (see photoVerificationInvalidation.js) — a
 *     reference is never assumed or fabricated.
 *   - Every decision (not the images) is written to a non-biometric audit
 *     trail (FaceReferenceAudit): action + reason code only.
 *
 * Deletion lifecycle (revoke / expire / replace):
 *   A reference NEVER jumps straight from "active" to "the user's biometric
 *   data is gone" — it is immediately moved OUT of "active" (so it can
 *   never be reused for a comparison again, even if AWS's own delete call
 *   fails or is slow), into "pending_deletion" while AWS's DeleteFaces is
 *   attempted. Only once AWS confirms is the local record's encrypted
 *   pointer cleared and the status settled to its final value ("revoked" or
 *   "expired"). If AWS fails, the attempt is tracked (deletionAttempts/
 *   lastDeletionAttemptAt/lastDeletionError) for safe retry by
 *   retryPendingFaceReferenceDeletions() — never reported to the user as
 *   fully deleted until that confirmation happens.
 */

const crypto = require("crypto");
const FaceReference = require("../models/FaceReference.js");
const FaceReferenceAudit = require("../models/FaceReferenceAudit.js");
const { getPhotoVerificationConfig } = require("../config/photoVerification.js");
const rekognitionClient = require("../lib/rekognitionClient.js");
const { encryptFaceId, decryptFaceId } = require("../lib/faceReferenceCrypto.js");
const { downloadVerifiedImageBytes, SecureImageFetchError } = require("../lib/secureImageFetch.js");

const hashIp = (ip) => (ip ? crypto.createHash("sha256").update(String(ip)).digest("hex") : "");
const hashBytes = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Audit actions that represent an ACTUAL AWS comparison attempt (used for
// the comparisons abuse/cost rate limit below) — deliberately excludes
// short-circuited outcomes like "no_reference"/"unavailable" that never
// touch AWS at all.
const COMPARISON_ATTEMPT_ACTIONS = ["matched", "mismatch", "review", "error"];

const writeAudit = async (userId, action, reasonCode, ip) => {
  try {
    await FaceReferenceAudit.create({ userId, action, reasonCode: reasonCode || "", ipHash: hashIp(ip) });
  } catch (err) {
    // Audit logging must never break the main flow (it is diagnostic only).
    console.error("[face-reference] audit log failed:", err?.message || err);
  }
};

/**
 * The face-reference feature is only usable when photo verification itself
 * is enabled, the feature flag is on, AND an encryption key is configured —
 * missing any of these means "never create or use a reference", not "store
 * it unprotected" or "treat it as present".
 */
const isFeatureUsable = (config) =>
  Boolean(config.enabled && config.faceReferenceEnabled && config.faceReferenceEncryptionKey);

/**
 * Abuse/cost control for the expensive path (image download + AWS
 * SearchFacesByImage), counted from the non-biometric audit trail so it
 * applies uniformly no matter which primary-photo-change endpoint
 * triggered the comparison, and survives across multiple backend
 * instances (it is NOT an in-memory, per-process counter).
 */
const isComparisonRateLimited = async (userId, config) => {
  const windowStart = new Date(Date.now() - config.faceReferenceComparisonWindowMs);
  const recentAttempts = await FaceReferenceAudit.countDocuments({
    userId,
    action: { $in: COMPARISON_ATTEMPT_ACTIONS },
    createdAt: { $gte: windowStart },
  });
  return recentAttempts >= config.faceReferenceMaxComparisonsPerWindow;
};

/**
 * Atomically moves a reference OUT of "active" and into "pending_deletion",
 * capturing the collectionId/FaceId that needs deleting from AWS into
 * dedicated `pendingDelete*` fields — decoupled from the document's main
 * `collectionId`/`encryptedFaceId`, which may be immediately reused for a
 * brand-new reference (e.g. re-opting-in right after a revoke). This is
 * what prevents a replaced/revoked face from ever being left as an
 * unmanaged, un-retried orphan in the AWS collection.
 */
const schedulePendingDeletion = async ({ matchFilter, postDeletionStatus, extraSet = {} }) => {
  const claimed = await FaceReference.findOneAndUpdate(
    matchFilter,
    [
      {
        $set: {
          pendingDeleteCollectionId: "$collectionId",
          pendingDeleteEncryptedFaceId: "$encryptedFaceId",
          status: "pending_deletion",
          deletionPending: true,
          postDeletionStatus,
          ...extraSet,
        },
      },
    ],
    { new: true }
  );
  return claimed;
};

/**
 * Attempts the actual AWS-side DeleteFaces call for a reference already in
 * "pending_deletion", using the preserved `pendingDelete*` fields (never the
 * possibly-already-reused main fields). On success, clears the encrypted
 * pointer and settles the final status. On failure, tracks the attempt for
 * a safe later retry — NEVER silently drops it. Never logs the FaceId,
 * encrypted payload, or any credential — only a bounded, generic error
 * code/name.
 */
const attemptAwsDeletion = async (referenceDoc) => {
  if (!referenceDoc) return { confirmed: false, reasonCode: "NOT_FOUND" };

  const collectionId = referenceDoc.pendingDeleteCollectionId;
  const encryptedFaceId = referenceDoc.pendingDeleteEncryptedFaceId;

  if (!collectionId || !encryptedFaceId) {
    // Nothing left to delete (already cleared by a prior successful
    // attempt, or there was never anything to index) — settle as confirmed.
    await FaceReference.updateOne(
      { _id: referenceDoc._id },
      {
        $set: {
          status: referenceDoc.postDeletionStatus || "revoked",
          deletionPending: false,
          deletionConfirmedAt: new Date(),
        },
        $unset: { pendingDeleteCollectionId: "", pendingDeleteEncryptedFaceId: "" },
      }
    );
    return { confirmed: true };
  }

  const config = getPhotoVerificationConfig();
  let faceId;
  try {
    faceId = decryptFaceId(encryptedFaceId, config.faceReferenceEncryptionKey);
  } catch (err) {
    await FaceReference.updateOne(
      { _id: referenceDoc._id },
      {
        $set: {
          deletionAttempts: (referenceDoc.deletionAttempts || 0) + 1,
          lastDeletionAttemptAt: new Date(),
          lastDeletionError: "DECRYPT_FAILED",
        },
      }
    );
    console.error("[face-reference] cannot decrypt pending-deletion reference (will retry):", err?.name || "error");
    return { confirmed: false, reasonCode: "DECRYPT_FAILED" };
  }

  try {
    await rekognitionClient.deleteFaces(collectionId, [faceId]);
  } catch (err) {
    await FaceReference.updateOne(
      { _id: referenceDoc._id },
      {
        $set: {
          deletionAttempts: (referenceDoc.deletionAttempts || 0) + 1,
          lastDeletionAttemptAt: new Date(),
          lastDeletionError: String(err?.name || err?.code || "AWS_DELETE_FAILED").slice(0, 120),
        },
      }
    );
    console.error(
      "[face-reference] AWS deleteFaces failed, scheduled for retry:",
      err?.name || err?.code || "unknown_error"
    );
    return { confirmed: false, reasonCode: "AWS_DELETE_FAILED" };
  }

  await FaceReference.updateOne(
    { _id: referenceDoc._id },
    {
      $set: {
        status: referenceDoc.postDeletionStatus || "revoked",
        deletionPending: false,
        deletionConfirmedAt: new Date(),
        encryptedFaceId: "",
      },
      $unset: { pendingDeleteCollectionId: "", pendingDeleteEncryptedFaceId: "" },
    }
  );
  return { confirmed: true };
};

/**
 * Persists a reusable face reference right after an approved ("verified")
 * selfie session, ONLY if the user gave separate, explicit consent to keep
 * one. Called with the liveness reference image bytes that already exist in
 * memory for that request — never a newly-requested selfie, and the bytes
 * themselves are discarded the moment this function returns.
 *
 * Best-effort: any failure here must NEVER fail the surrounding "verified"
 * result for the CURRENT photo — it only means no reference gets persisted
 * for reuse later (same as if consent had not been given).
 */
const saveFaceReferenceFromVerifiedSession = async ({ userId, imageBytes, ip } = {}) => {
  const config = getPhotoVerificationConfig();
  if (!isFeatureUsable(config)) return { saved: false, reasonCode: "FEATURE_DISABLED" };
  if (!Buffer.isBuffer(imageBytes) || imageBytes.length === 0) {
    return { saved: false, reasonCode: "NO_IMAGE_BYTES" };
  }

  try {
    await rekognitionClient.ensureCollection(config.faceReferenceCollectionId);
    const { faceId } = await rekognitionClient.indexFace(config.faceReferenceCollectionId, imageBytes);
    if (!faceId) {
      await writeAudit(userId, "error", "NO_FACE_INDEXED", ip);
      return { saved: false, reasonCode: "NO_FACE_INDEXED" };
    }

    const encryptedFaceId = encryptFaceId(faceId, config.faceReferenceEncryptionKey);
    const now = new Date();
    const retentionExpiresAt = new Date(now.getTime() + config.faceReferenceRetentionDays * ONE_DAY_MS);

    // Replace any prior reference for this user (e.g. re-opting-in after a
    // previous revocation) rather than accumulating multiple AWS faces. The
    // OLD face is moved to pending_deletion FIRST (capturing its own
    // collectionId/FaceId into pendingDelete* fields) so the upsert below
    // can safely reuse the same per-user document for the NEW face without
    // ever losing track of the old one — it stays independently tracked
    // for retry until AWS confirms it is gone.
    const previous = await FaceReference.findOne({ userId });
    if (previous && previous.status === "active") {
      const claimed = await schedulePendingDeletion({
        matchFilter: { _id: previous._id, status: "active" },
        postDeletionStatus: "revoked",
        extraSet: { consentWithdrawnAt: now },
      });
      if (claimed) {
        attemptAwsDeletion(claimed).catch((err) => {
          console.error("[face-reference] unexpected deletion-attempt failure:", err?.message || err);
        });
      }
    }

    await FaceReference.findOneAndUpdate(
      { userId },
      {
        $set: {
          collectionId: config.faceReferenceCollectionId,
          encryptedFaceId,
          sourcePhotoHash: hashBytes(imageBytes),
          status: "active",
          consentedAt: now,
          consentWithdrawnAt: null,
          retentionExpiresAt,
          lastUsedAt: null,
          deletionPending: false,
          deletionConfirmedAt: null,
          deletionAttempts: 0,
          lastDeletionAttemptAt: null,
          lastDeletionError: "",
        },
      },
      { upsert: true, new: true }
    );

    await writeAudit(userId, "created", "MATCH", ip);
    return { saved: true };
  } catch (err) {
    console.error("[face-reference] failed to save reference:", err?.message || err);
    await writeAudit(userId, "error", "SAVE_FAILED", ip);
    return { saved: false, reasonCode: "SAVE_FAILED" };
  }
};

/**
 * Returns the user's currently-usable (active, consented, unexpired)
 * reference, or null. A reference that is "active" but past its retention
 * window is NEVER reused — it is atomically retired to pending_deletion
 * (with AWS cleanup attempted, tracked for retry on failure) the moment it
 * is found to be expired, so it can never be matched against again.
 */
const getUsableReference = async (userId) => {
  const reference = await FaceReference.findOne({ userId, status: "active", consentWithdrawnAt: null });
  if (!reference) return null;
  if (!reference.retentionExpiresAt || reference.retentionExpiresAt.getTime() < Date.now()) {
    schedulePendingDeletion({
      matchFilter: { _id: reference._id, status: "active" },
      postDeletionStatus: "expired",
    })
      .then((claimed) => claimed && attemptAwsDeletion(claimed))
      .catch(() => {});
    return null;
  }
  return reference;
};

/**
 * Compares a NEW primary photo against the user's existing consented face
 * reference. Returns a decision describing whether the prior verification
 * can be carried over WITHOUT a new selfie. Never auto-approves on an
 * uncertain or failed AWS call — those fall back to "no_match" so the
 * caller resets to "none" (requiring a new selfie), exactly the pre-existing
 * invalidate-on-photo-change behavior.
 */
const compareAgainstReference = async ({ userId, newPhotoUrl, ip } = {}) => {
  const config = getPhotoVerificationConfig();
  if (!isFeatureUsable(config)) {
    await writeAudit(userId, "unavailable", "FEATURE_DISABLED", ip);
    return { status: "unavailable", reasonCode: "FEATURE_DISABLED" };
  }

  if (await isComparisonRateLimited(userId, config)) {
    await writeAudit(userId, "rate_limited", "RATE_LIMITED", ip);
    return { status: "error", reasonCode: "RATE_LIMITED" };
  }

  const reference = await getUsableReference(userId);
  if (!reference) {
    await writeAudit(userId, "no_reference", "NO_REFERENCE", ip);
    return { status: "no_reference", reasonCode: "NO_REFERENCE" };
  }

  let storedFaceId;
  try {
    storedFaceId = decryptFaceId(reference.encryptedFaceId, config.faceReferenceEncryptionKey);
  } catch (err) {
    console.error("[face-reference] failed to decrypt stored reference:", err?.message || err);
    await writeAudit(userId, "error", "DECRYPT_FAILED", ip);
    return { status: "error", reasonCode: "DECRYPT_FAILED" };
  }

  let targetImageBytes;
  try {
    targetImageBytes = await downloadVerifiedImageBytes(newPhotoUrl);
  } catch (err) {
    const reasonCode = err instanceof SecureImageFetchError ? "PHOTO_UNREACHABLE" : "DOWNLOAD_FAILED";
    await writeAudit(userId, "error", reasonCode, ip);
    return { status: "error", reasonCode };
  }

  let searchResult;
  try {
    searchResult = await rekognitionClient.searchFacesByImage(reference.collectionId, targetImageBytes);
  } catch (err) {
    console.error("[face-reference] AWS comparison failed:", err?.message || err);
    await writeAudit(userId, "error", "AWS_UNAVAILABLE", ip);
    return { status: "error", reasonCode: "AWS_UNAVAILABLE" };
  }

  // Both conditions matter: the match must point at THIS user's own stored
  // FaceId (never just "some" face in the shared collection), AND clear our
  // configured similarity threshold.
  const isSameStoredFace = Boolean(searchResult && searchResult.faceId === storedFaceId);
  const similarity = searchResult?.similarity ?? 0;

  if (isSameStoredFace && similarity >= config.faceReferenceMatchThreshold) {
    FaceReference.updateOne({ _id: reference._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {});
    await writeAudit(userId, "matched", "MATCH", ip);
    return { status: "verified", reasonCode: "MATCH" };
  }

  // Borderline (same face indexed, but below our stricter threshold) is
  // treated as uncertain, not a hard mismatch — but NEVER auto-approved.
  if (isSameStoredFace && similarity >= config.faceReferenceMatchThreshold / 2) {
    await writeAudit(userId, "review", "LOW_SIMILARITY", ip);
    return { status: "review", reasonCode: "LOW_SIMILARITY" };
  }

  await writeAudit(userId, "mismatch", "FACE_MISMATCH", ip);
  return { status: "mismatch", reasonCode: "FACE_MISMATCH" };
};

/**
 * Explicit, user-initiated deletion of the kept reference (consent
 * withdrawal / "right to delete"). Idempotent and safe to call even if no
 * reference exists or it was already revoked — atomic conditional update
 * so two concurrent revoke requests can never both attempt the AWS delete.
 *
 * Revocation takes effect LOCALLY the instant this returns — the reference
 * leaves "active" atomically, so it can never be used for a comparison
 * again — regardless of whether AWS's own deletion has been confirmed yet.
 * `deletionConfirmed` tells the caller whether AWS has ALSO confirmed the
 * data is gone; when false, a background retry (see
 * retryPendingFaceReferenceDeletions) will keep trying until it is.
 */
const revokeFaceReference = async (userId, { ip } = {}) => {
  const claimed = await schedulePendingDeletion({
    matchFilter: { userId, status: "active" },
    postDeletionStatus: "revoked",
    extraSet: { consentWithdrawnAt: new Date() },
  });

  if (!claimed) {
    // Nothing active to revoke — still a successful, idempotent outcome.
    return { revoked: false };
  }

  const outcome = await attemptAwsDeletion(claimed);
  await writeAudit(
    userId,
    outcome.confirmed ? "revoked" : "pending_deletion",
    outcome.confirmed ? "CONSENT_WITHDRAWN" : "DELETION_RETRY_SCHEDULED",
    ip
  );
  return { revoked: true, deletionConfirmed: outcome.confirmed };
};

/** Non-sensitive status summary for the account/privacy UI. */
const getFaceReferenceStatus = async (userId) => {
  const reference = await FaceReference.findOne({ userId, status: "active", consentWithdrawnAt: null }).select(
    "consentedAt retentionExpiresAt lastUsedAt"
  );
  if (!reference || reference.retentionExpiresAt.getTime() < Date.now()) {
    return { hasReference: false, consentedAt: null, retentionExpiresAt: null, lastUsedAt: null };
  }
  return {
    hasReference: true,
    consentedAt: reference.consentedAt,
    retentionExpiresAt: reference.retentionExpiresAt,
    lastUsedAt: reference.lastUsedAt,
  };
};

/**
 * Background-job entry point: finds every reference still waiting on an
 * AWS-side deletion confirmation (revoked, expired, or superseded-by-a-
 * replacement) and retries the DeleteFaces call. Safe to call repeatedly/
 * concurrently — each attempt is independent and idempotent (a reference
 * already fully deleted on AWS's side simply fails to find the FaceId,
 * which AWS treats as a no-op success).
 */
const retryPendingFaceReferenceDeletions = async ({ limit = 50 } = {}) => {
  const pending = await FaceReference.find({ deletionPending: true }).limit(limit);
  let confirmed = 0;
  let stillPending = 0;
  for (const doc of pending) {
    // eslint-disable-next-line no-await-in-loop -- intentionally sequential to bound AWS call concurrency.
    const outcome = await attemptAwsDeletion(doc);
    if (outcome.confirmed) confirmed += 1;
    else stillPending += 1;
  }
  return { processed: pending.length, confirmed, stillPending };
};

/**
 * Account-deletion integration: ensures a user's kept face reference (if
 * any) is scheduled for AWS deletion as part of permanently removing their
 * account — never left behind as an orphaned, un-retried biometric pointer.
 * Safe to call even when no reference exists.
 */
const revokeFaceReferenceForAccountDeletion = async (userId) => {
  const claimed = await schedulePendingDeletion({
    matchFilter: { userId, status: { $in: ["active", "pending_deletion"] } },
    postDeletionStatus: "revoked",
    extraSet: { consentWithdrawnAt: new Date() },
  });
  if (!claimed) return { scheduled: false };
  await attemptAwsDeletion(claimed).catch((err) => {
    console.error("[face-reference] account-deletion AWS cleanup failed, will retry:", err?.message || err);
  });
  return { scheduled: true };
};

module.exports = {
  isFeatureUsable,
  saveFaceReferenceFromVerifiedSession,
  compareAgainstReference,
  revokeFaceReference,
  getFaceReferenceStatus,
  retryPendingFaceReferenceDeletions,
  revokeFaceReferenceForAccountDeletion,
};
