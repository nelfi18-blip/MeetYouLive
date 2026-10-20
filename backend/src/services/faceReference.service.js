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
 *   data is gone" — it is atomically moved OUT of "active" (so it can never
 *   be reused for a comparison again, even if AWS's own delete call fails or
 *   is slow) into its terminal local status ("revoked"/"expired"), while the
 *   actual AWS-side vector it still needs to delete is captured into its OWN
 *   independent FaceReferenceDeletion document (see that model) — never as
 *   fields reused on the SAME, soon-to-be-replaced FaceReference document.
 *   This is what guarantees a later reference creation/replacement for the
 *   same user can never corrupt, overwrite, or lose track of an in-flight
 *   deletion, and that two concurrent deletions can never race each other.
 */

const crypto = require("crypto");
const FaceReference = require("../models/FaceReference.js");
const FaceReferenceDeletion = require("../models/FaceReferenceDeletion.js");
const FaceReferenceAudit = require("../models/FaceReferenceAudit.js");
const { getPhotoVerificationConfig } = require("../config/photoVerification.js");
const rekognitionClient = require("../lib/rekognitionClient.js");
const { encryptFaceId, decryptFaceId } = require("../lib/faceReferenceCrypto.js");
const { downloadVerifiedImageBytes, SecureImageFetchError } = require("../lib/secureImageFetch.js");

const hashIp = (ip) => (ip ? crypto.createHash("sha256").update(String(ip)).digest("hex") : "");
const hashBytes = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const PERSIST_RETRY_ATTEMPTS = 3;
const PERSIST_RETRY_BASE_DELAY_MS = 150;

// Audit actions that represent an ACTUAL AWS comparison attempt (used for
// the comparisons abuse/cost rate limit below) — deliberately excludes
// short-circuited outcomes like "no_reference"/"unavailable" that never
// touch AWS at all.
const COMPARISON_ATTEMPT_ACTIONS = ["matched", "mismatch", "review", "error"];

// Every reason a reference can be retired collapses into one of these two
// LOCAL terminal statuses on the FaceReference document itself — the
// specific reason (and whatever AWS-side cleanup it implies) is tracked
// independently on the FaceReferenceDeletion record.
const REASON_TO_TERMINAL_STATUS = {
  revoked: "revoked",
  expired: "expired",
  replaced: "revoked",
  account_deleted: "revoked",
};

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
 * Atomically moves a reference OUT of "active" into its terminal local
 * status, returning the PRE-update document (`new: false`, the default) so
 * the caller captures the OLD `collectionId`/`encryptedFaceId` safely in a
 * local variable at the exact moment of the transition — before anything
 * else (e.g. a concurrent upsert creating a replacement reference for the
 * same user) can touch those fields. The conditional filter (callers always
 * include `status: "active"`) is also what makes two concurrent retirements
 * of the SAME reference mutually exclusive: only one `findOneAndUpdate` can
 * ever match and return a non-null document; the other gets `null` and must
 * treat it as an idempotent no-op.
 */
const retireActiveReference = async ({ matchFilter, reason, extraSet = {} }) => {
  const terminalStatus = REASON_TO_TERMINAL_STATUS[reason] || "revoked";
  const previous = await FaceReference.findOneAndUpdate(matchFilter, {
    $set: { status: terminalStatus, ...extraSet },
  });
  return previous;
};

/**
 * Persists a brand-new, fully independent FaceReferenceDeletion record for
 * the vector a just-retired reference still needs deleted from AWS. Retries
 * a few times (Mongo failures here are typically transient) so a single
 * blip never silently drops the only record of a face vector that must be
 * deleted. If persistence still fails after retries, this NEVER touches or
 * overwrites the old reference's identifiers elsewhere — it only logs a
 * CRITICAL, non-biometric trace (collectionId + a hash of the ciphertext,
 * never the raw/decrypted FaceId or the ciphertext itself) so operations
 * has a trail to investigate, and returns null.
 */
const persistPendingDeletion = async ({ userId, collectionId, encryptedFaceId, reason }) => {
  let lastErr;
  for (let attempt = 1; attempt <= PERSIST_RETRY_ATTEMPTS; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop -- intentional bounded retry, not a hot loop.
      return await FaceReferenceDeletion.create({ userId, collectionId, encryptedFaceId, reason });
    } catch (err) {
      lastErr = err;
      if (attempt < PERSIST_RETRY_ATTEMPTS) {
        // eslint-disable-next-line no-await-in-loop -- intentional bounded retry, not a hot loop.
        await sleep(PERSIST_RETRY_BASE_DELAY_MS * attempt);
      }
    }
  }
  console.error(
    "[face-reference] CRITICAL: failed to persist pending-deletion record after retries — a face vector may be orphaned.",
    {
      userId: String(userId || ""),
      collectionId,
      encryptedFaceIdHash: hashBytes(Buffer.from(String(encryptedFaceId || ""))),
    },
    lastErr?.message || lastErr
  );
  return null;
};

/**
 * Attempts the actual AWS-side DeleteFaces call for one pending deletion
 * record, identified only by its own immutable `_id`. The atomic conditional
 * claim (`status: "pending"`) ensures two concurrent processors (e.g. the
 * retry job and an inline attempt right after scheduling) can never both
 * run the AWS call for the same record. Never logs the FaceId, encrypted
 * payload, or any credential — only a bounded, generic error code/name.
 */
const attemptPendingDeletion = async (deletionId) => {
  const claimed = await FaceReferenceDeletion.findOneAndUpdate(
    { _id: deletionId, status: "pending" },
    { $set: { lastAttemptAt: new Date() }, $inc: { attempts: 1 } },
    { new: true }
  );
  if (!claimed) return { confirmed: false, reasonCode: "ALREADY_PROCESSED" };

  const config = getPhotoVerificationConfig();
  let faceId;
  try {
    faceId = decryptFaceId(claimed.encryptedFaceId, config.faceReferenceEncryptionKey);
  } catch (err) {
    await FaceReferenceDeletion.updateOne({ _id: claimed._id }, { $set: { lastError: "DECRYPT_FAILED" } });
    console.error("[face-reference] cannot decrypt pending-deletion record (will retry):", err?.name || "error");
    return { confirmed: false, reasonCode: "DECRYPT_FAILED" };
  }

  try {
    await rekognitionClient.deleteFaces(claimed.collectionId, [faceId]);
  } catch (err) {
    await FaceReferenceDeletion.updateOne(
      { _id: claimed._id },
      { $set: { lastError: String(err?.name || err?.code || "AWS_DELETE_FAILED").slice(0, 120) } }
    );
    console.error(
      "[face-reference] AWS deleteFaces failed, scheduled for retry:",
      err?.name || err?.code || "unknown_error"
    );
    return { confirmed: false, reasonCode: "AWS_DELETE_FAILED" };
  }

  await FaceReferenceDeletion.updateOne(
    { _id: claimed._id },
    { $set: { status: "confirmed", confirmedAt: new Date() } }
  );
  return { confirmed: true };
};

/**
 * Retires an active reference matched by `matchFilter` AND schedules its
 * AWS-side deletion as an independent FaceReferenceDeletion record, making a
 * synchronous first attempt to actually delete it from AWS right away (so
 * most revokes/replacements complete without ever needing the retry job).
 * Returns null when nothing matched (idempotent no-op — e.g. the reference
 * was already retired by a concurrent request).
 */
const retireAndScheduleDeletion = async ({ matchFilter, reason, extraSet = {} }) => {
  const previous = await retireActiveReference({ matchFilter, reason, extraSet });
  if (!previous) return null;

  const deletionDoc = await persistPendingDeletion({
    userId: previous.userId,
    collectionId: previous.collectionId,
    encryptedFaceId: previous.encryptedFaceId,
    reason,
  });

  if (!deletionDoc) {
    return { previous, deletionDoc: null, outcome: { confirmed: false, reasonCode: "PERSIST_FAILED" } };
  }

  const outcome = await attemptPendingDeletion(deletionDoc._id);
  return { previous, deletionDoc, outcome };
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
 * for reuse later (same as if consent had not been given). If IndexFaces
 * already created a new AWS vector but the subsequent Mongo write fails,
 * that vector is compensated (deleted from AWS) before returning, so it is
 * never left orphaned with zero local tracking.
 */
const saveFaceReferenceFromVerifiedSession = async ({ userId, imageBytes, ip } = {}) => {
  const config = getPhotoVerificationConfig();
  if (!isFeatureUsable(config)) return { saved: false, reasonCode: "FEATURE_DISABLED" };
  if (!Buffer.isBuffer(imageBytes) || imageBytes.length === 0) {
    return { saved: false, reasonCode: "NO_IMAGE_BYTES" };
  }

  let faceId;
  try {
    await rekognitionClient.ensureCollection(config.faceReferenceCollectionId);
    const indexed = await rekognitionClient.indexFace(config.faceReferenceCollectionId, imageBytes);
    faceId = indexed?.faceId;
  } catch (err) {
    console.error("[face-reference] IndexFaces failed:", err?.message || err);
    await writeAudit(userId, "error", "INDEX_FAILED", ip);
    return { saved: false, reasonCode: "INDEX_FAILED" };
  }

  if (!faceId) {
    await writeAudit(userId, "error", "NO_FACE_INDEXED", ip);
    return { saved: false, reasonCode: "NO_FACE_INDEXED" };
  }

  // From this point on, a new AWS vector (`faceId`) exists. Any failure
  // below must compensate by deleting it — never leave it orphaned.
  try {
    const encryptedFaceId = encryptFaceId(faceId, config.faceReferenceEncryptionKey);
    const now = new Date();
    const retentionExpiresAt = new Date(now.getTime() + config.faceReferenceRetentionDays * ONE_DAY_MS);

    // Replace any prior reference for this user (e.g. re-opting-in after a
    // previous revocation) rather than accumulating multiple AWS faces. The
    // OLD face is retired FIRST, atomically, into its own independent
    // FaceReferenceDeletion record — fully decoupled from the per-user
    // FaceReference document, which is immediately reused below for the
    // NEW face without ever losing track of the old one.
    const previous = await FaceReference.findOne({ userId, status: "active" });
    if (previous) {
      const result = await retireAndScheduleDeletion({
        matchFilter: { _id: previous._id, status: "active" },
        reason: "replaced",
        extraSet: { consentWithdrawnAt: now },
      });
      if (result && result.outcome && !result.outcome.confirmed) {
        console.error(
          "[face-reference] old reference deletion not yet confirmed (will retry):",
          result.outcome.reasonCode
        );
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
        },
      },
      { upsert: true, new: true }
    );

    await writeAudit(userId, "created", "MATCH", ip);
    return { saved: true };
  } catch (err) {
    console.error("[face-reference] failed to save reference, compensating orphaned AWS vector:", err?.message || err);
    try {
      await rekognitionClient.deleteFaces(config.faceReferenceCollectionId, [faceId]);
    } catch (compensationErr) {
      console.error(
        "[face-reference] CRITICAL: orphaned-vector compensation delete also failed:",
        compensationErr?.name || compensationErr?.code || "unknown_error"
      );
    }
    await writeAudit(userId, "error", "SAVE_FAILED", ip);
    return { saved: false, reasonCode: "SAVE_FAILED" };
  }
};

/**
 * Returns the user's currently-usable (active, consented, unexpired)
 * reference, or null. A reference that is "active" but past its retention
 * window is NEVER reused — it is atomically retired (with AWS cleanup
 * scheduled via its own independent deletion record) the moment it is found
 * to be expired, so it can never be matched against again.
 */
const getUsableReference = async (userId) => {
  const reference = await FaceReference.findOne({ userId, status: "active", consentWithdrawnAt: null });
  if (!reference) return null;
  if (!reference.retentionExpiresAt || reference.retentionExpiresAt.getTime() < Date.now()) {
    retireAndScheduleDeletion({
      matchFilter: { _id: reference._id, status: "active" },
      reason: "expired",
    }).catch((err) => {
      console.error("[face-reference] failed to schedule expired-reference deletion:", err?.message || err);
    });
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
    // Fail-closed re-check: the AWS round-trip above can take long enough
    // for the user (or a concurrent request) to revoke/replace this exact
    // reference in the meantime. This atomic conditional update is the
    // ONLY place that is allowed to confirm "still active" right before
    // returning "verified" — if it finds the reference is no longer active,
    // a concurrently-revoked consent can never still grant the badge.
    const stillActive = await FaceReference.findOneAndUpdate(
      { _id: reference._id, status: "active", consentWithdrawnAt: null },
      { $set: { lastUsedAt: new Date() } },
      { new: true }
    );
    if (!stillActive) {
      await writeAudit(userId, "no_reference", "REVOKED_DURING_COMPARISON", ip);
      return { status: "no_reference", reasonCode: "REVOKED_DURING_COMPARISON" };
    }
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
 * so two concurrent revoke requests can never both attempt the AWS delete
 * (only one can ever match `status: "active"`; the other is a no-op).
 *
 * Revocation takes effect LOCALLY the instant this returns — the reference
 * leaves "active" atomically, so it can never be used for a comparison
 * again — regardless of whether AWS's own deletion has been confirmed yet.
 * `deletionConfirmed` tells the caller whether AWS has ALSO confirmed the
 * data is gone; when false, a background retry (see
 * retryPendingFaceReferenceDeletions) will keep trying until it is.
 */
const revokeFaceReference = async (userId, { ip } = {}) => {
  const result = await retireAndScheduleDeletion({
    matchFilter: { userId, status: "active" },
    reason: "revoked",
    extraSet: { consentWithdrawnAt: new Date() },
  });

  if (!result) {
    // Nothing active to revoke — still a successful, idempotent outcome.
    return { revoked: false };
  }

  const confirmed = Boolean(result.outcome && result.outcome.confirmed);
  await writeAudit(
    userId,
    confirmed ? "revoked" : "pending_deletion",
    confirmed ? "CONSENT_WITHDRAWN" : "DELETION_RETRY_SCHEDULED",
    ip
  );
  return { revoked: true, deletionConfirmed: confirmed };
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
 * Background-job entry point: finds every independent deletion record still
 * waiting on an AWS-side confirmation (revoked, expired, or superseded-by-a-
 * replacement) and retries the DeleteFaces call. Safe to call repeatedly/
 * concurrently — each attempt atomically claims its own record before
 * touching AWS (see attemptPendingDeletion), so two overlapping job runs can
 * never double-process, or lose track of, the same pending deletion.
 */
const retryPendingFaceReferenceDeletions = async ({ limit = 50 } = {}) => {
  const pending = await FaceReferenceDeletion.find({ status: "pending" }).limit(limit);
  let confirmed = 0;
  let stillPending = 0;
  for (const doc of pending) {
    // eslint-disable-next-line no-await-in-loop -- intentionally sequential to bound AWS call concurrency.
    const outcome = await attemptPendingDeletion(doc._id);
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
  const result = await retireAndScheduleDeletion({
    matchFilter: { userId, status: "active" },
    reason: "account_deleted",
    extraSet: { consentWithdrawnAt: new Date() },
  });
  if (!result) return { scheduled: false };
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
