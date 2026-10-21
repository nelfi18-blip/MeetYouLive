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
const mongoose = require("mongoose");
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
 * status AND persists the independent FaceReferenceDeletion record for the
 * vector it still needs deleted from AWS — as a SINGLE MongoDB transaction.
 *
 * This is what guarantees retiring a reference and recording its pending
 * deletion can never be split into "retired but the deletion record was
 * lost" (the exact orphaning risk this function exists to close): either
 * BOTH writes commit together, or NEITHER does — there is no partial state
 * where a FaceId has left local tracking with nothing recoverable to retry.
 *
 * The whole transaction is retried a bounded number of times (transient
 * Mongo errors, e.g. a write conflict or a brief replica-set election, are
 * expected to succeed on retry) before giving up. If every attempt fails,
 * this returns `{ failed: true }` and — critically — leaves the reference
 * completely untouched (still whatever it was before this call), so the
 * caller must treat the retirement itself as NOT having happened yet
 * (nothing was lost because nothing was partially written).
 *
 * The conditional filter (callers always include `status: "active"`) is
 * also what makes two concurrent retirements of the SAME reference mutually
 * exclusive: only one transaction can ever observe and update a matching
 * document; the other sees no match and must treat it as an idempotent
 * no-op (not a failure).
 */
const retireActiveReferenceWithPendingDeletion = async ({ matchFilter, reason, extraSet = {} }) => {
  const terminalStatus = REASON_TO_TERMINAL_STATUS[reason] || "revoked";
  let lastErr;

  for (let attempt = 1; attempt <= PERSIST_RETRY_ATTEMPTS; attempt += 1) {
    const dbSession = await mongoose.startSession();
    let previous = null;
    let deletionDoc = null;
    try {
      await dbSession.withTransaction(async () => {
        previous = await FaceReference.findOneAndUpdate(
          matchFilter,
          { $set: { status: terminalStatus, ...extraSet } },
          { session: dbSession }
        );
        if (!previous) return; // Nothing active matched — legitimate no-op, not an error.

        const [created] = await FaceReferenceDeletion.create(
          [
            {
              userId: previous.userId,
              collectionId: previous.collectionId,
              encryptedFaceId: previous.encryptedFaceId,
              reason,
            },
          ],
          { session: dbSession }
        );
        deletionDoc = created;
      });
      return { previous, deletionDoc };
    } catch (err) {
      lastErr = err;
      if (attempt < PERSIST_RETRY_ATTEMPTS) {
        // eslint-disable-next-line no-await-in-loop -- intentional bounded retry, not a hot loop.
        await sleep(PERSIST_RETRY_BASE_DELAY_MS * attempt);
      }
    } finally {
      dbSession.endSession();
    }
  }

  console.error(
    "[face-reference] CRITICAL: retire+pending-deletion transaction failed after retries — " +
      "reference left unchanged on purpose, nothing has been lost; safe to retry this call.",
    { matchFilterKeys: Object.keys(matchFilter || {}), reason },
    lastErr?.message || lastErr
  );
  return { failed: true };
};

/**
 * How long a "processing" claim is honored before it is considered stale
 * (e.g. the worker holding it crashed/was killed mid-call) and can be
 * reclaimed by another attempt. Deliberately generous relative to a single
 * DeleteFaces call so a merely-slow-but-alive worker is never preempted.
 */
const PROCESSING_LEASE_MS = 2 * 60 * 1000;

/**
 * Attempts the actual AWS-side DeleteFaces call for one pending deletion
 * record, identified only by its own immutable `_id`.
 *
 * Exclusive claim: the single atomic `findOneAndUpdate` below is the ONLY
 * place that grants a worker the right to call AWS for this record — it
 * transitions the record from "pending" (or a "processing" claim whose
 * lease has expired, i.e. an interrupted previous attempt) into
 * "processing" with a FRESH, unique `processingClaimId` and lease
 * timestamp, in one indivisible operation. Two concurrent callers (the
 * retry job and an inline attempt right after scheduling, or two
 * overlapping retry passes) can therefore never both have `claimed` be
 * non-null for the same record: only the first write MongoDB actually
 * applies matches the filter; by the time the second one runs, the status
 * is already "processing" with a lease that has not yet expired, so it
 * matches nothing and gets `null` back.
 *
 * Every write AFTER the initial claim (release-to-pending on failure,
 * confirm-on-success) is conditioned on `_id` + `status: "processing"` +
 * THIS SAME `processingClaimId` — never on `_id` alone. This is what
 * prevents the specific race the lease timestamp by itself cannot: if this
 * worker's own lease expires while it is still waiting on a slow AWS
 * response, a DIFFERENT worker can legitimately reclaim the same record
 * (minting its OWN new `processingClaimId`) and finish first. When the
 * ORIGINAL (now-stale) worker's AWS call finally returns and it tries to
 * write its outcome, its conditional update no longer matches anything
 * (the record's `processingClaimId` is no longer its own) and is silently
 * a no-op — it can never revert the newer worker's "confirmed" result back
 * to "pending", or otherwise clobber whatever the newer worker is doing.
 *
 * The claim is always released afterwards — back to "pending" on any
 * failure (so the record, and the encrypted FaceId it carries, is never
 * lost and remains eligible for a future retry), or to "confirmed" once AWS
 * has actually confirmed the vector is gone. A record can therefore never
 * stay stuck in "processing" forever even if this process crashes right
 * after claiming it: the lease simply expires and the next retry pass
 * reclaims it (minting a new claim id of its own).
 *
 * Never logs the FaceId, encrypted payload, or any credential — only a
 * bounded, generic error code/name.
 */
const attemptPendingDeletion = async (deletionId) => {
  const now = new Date();
  const staleLeaseBefore = new Date(now.getTime() - PROCESSING_LEASE_MS);
  const claimId = crypto.randomUUID();
  const claimed = await FaceReferenceDeletion.findOneAndUpdate(
    {
      _id: deletionId,
      $or: [
        { status: "pending" },
        { status: "processing", processingClaimedAt: { $lt: staleLeaseBefore } },
      ],
    },
    {
      $set: { status: "processing", processingClaimedAt: now, processingClaimId: claimId, lastAttemptAt: now },
      $inc: { attempts: 1 },
    },
    { new: true }
  );
  if (!claimed) return { confirmed: false, reasonCode: "ALREADY_PROCESSED" };

  // Every subsequent write for THIS attempt must match this exact claim —
  // see the big comment above for why `_id` alone is not sufficient.
  const ownClaimFilter = { _id: claimed._id, status: "processing", processingClaimId: claimId };

  const config = getPhotoVerificationConfig();
  let faceId;
  try {
    faceId = decryptFaceId(claimed.encryptedFaceId, config.faceReferenceEncryptionKey);
  } catch (err) {
    // Release the claim back to "pending" — the encrypted FaceId itself is
    // untouched (immutable in the schema), so a future retry (e.g. after a
    // config/key fix) can still decrypt and delete it. If another worker
    // already reclaimed this record (our lease expired meanwhile), this
    // conditional update matches nothing and is a safe no-op.
    await FaceReferenceDeletion.updateOne(
      ownClaimFilter,
      { $set: { status: "pending", processingClaimedAt: null, processingClaimId: null, lastError: "DECRYPT_FAILED" } }
    );
    console.error("[face-reference] cannot decrypt pending-deletion record (will retry):", err?.name || "error");
    return { confirmed: false, reasonCode: "DECRYPT_FAILED" };
  }

  try {
    // AWS Rekognition's DeleteFaces does not error when a FaceId is already
    // gone (e.g. a previous attempt's AWS call actually succeeded but this
    // process crashed before it could record that) — it is simply omitted
    // from the response's DeletedFaces list. That "already deleted" case is
    // therefore already handled safely as a normal success below, never as
    // a false failure.
    await rekognitionClient.deleteFaces(claimed.collectionId, [faceId]);
  } catch (err) {
    // Release the claim back to "pending" so the retry job can pick this
    // record up again later — never leave it stuck in "processing". Same
    // own-claim guard as above: if our lease already expired and someone
    // else took over, this is a no-op and never clobbers their progress.
    await FaceReferenceDeletion.updateOne(
      ownClaimFilter,
      {
        $set: {
          status: "pending",
          processingClaimedAt: null,
          processingClaimId: null,
          lastError: String(err?.name || err?.code || "AWS_DELETE_FAILED").slice(0, 120),
        },
      }
    );
    console.error(
      "[face-reference] AWS deleteFaces failed, scheduled for retry:",
      err?.name || err?.code || "unknown_error"
    );
    return { confirmed: false, reasonCode: "AWS_DELETE_FAILED" };
  }

  // Guarded the same way: if a different worker already reclaimed this
  // record (our own lease expired while AWS was slow to respond), this
  // update matches nothing — we must NOT report `confirmed: true` in that
  // case, since we no longer know whether OUR delete call raced a newer
  // worker's own attempt/outcome.
  const confirmResult = await FaceReferenceDeletion.updateOne(
    ownClaimFilter,
    { $set: { status: "confirmed", confirmedAt: new Date(), processingClaimedAt: null, processingClaimId: null } }
  );
  const persisted = Boolean(confirmResult?.modifiedCount ?? confirmResult?.nModified ?? 0);
  if (!persisted) {
    console.error(
      "[face-reference] AWS deleteFaces succeeded but this worker's claim had already expired/been reclaimed; " +
        "not reporting confirmation to avoid clobbering a newer worker's state (will be reconciled on next pass):",
      String(claimed._id)
    );
    return { confirmed: false, reasonCode: "CLAIM_LOST_AFTER_AWS_SUCCESS" };
  }
  return { confirmed: true };
};

/**
 * Retires an active reference matched by `matchFilter` AND schedules its
 * AWS-side deletion as an independent FaceReferenceDeletion record (as one
 * atomic, retried transaction — see `retireActiveReferenceWithPendingDeletion`),
 * making a synchronous first attempt to actually delete it from AWS right
 * away (so most revokes/replacements complete without ever needing the
 * retry job).
 *
 * Return shapes callers must handle:
 *   - `null`               — idempotent no-op: nothing active matched.
 *   - `{ failed: true }`   — the retire+persist transaction never committed
 *                            after retries; the reference is UNCHANGED
 *                            (still whatever it was before this call) and
 *                            nothing was lost. Callers MUST treat this as
 *                            "retirement did not happen" — never assume the
 *                            reference became unusable, and never proceed to
 *                            overwrite/replace it.
 *   - `{ previous, deletionDoc, outcome }` — retirement + persistence
 *                            committed together; `outcome.confirmed` tells
 *                            the caller whether AWS has ALSO confirmed the
 *                            vector is gone yet (the retry job keeps trying
 *                            if not — the local tracking record is durable
 *                            either way).
 */
const retireAndScheduleDeletion = async ({ matchFilter, reason, extraSet = {} }) => {
  const result = await retireActiveReferenceWithPendingDeletion({ matchFilter, reason, extraSet });
  if (result.failed) return { failed: true };

  const { previous, deletionDoc } = result;
  if (!previous) return null;

  const outcome = await attemptPendingDeletion(deletionDoc._id);
  return { previous, deletionDoc, outcome };
};

/**
 * Last-resort durable fallback for a face vector that AWS IndexFaces already
 * created but that never ended up attached to a successfully-saved
 * FaceReference document (the Mongo write failed) — used ONLY after the
 * synchronous AWS compensation `DeleteFaces` call ALSO failed, so the vector
 * would otherwise be completely untracked. Retries a few times for
 * transient Mongo errors. Never logs the FaceId or encrypted payload.
 *
 * Returns the created record on success, or `null` if it could NOT be
 * persisted even after retries — callers MUST treat `null` as an actual,
 * unresolved critical failure (no recoverable record exists anywhere) and
 * must never report/imply that cleanup is guaranteed in that case.
 */
const persistOrphanedVectorDeletion = async ({ userId, collectionId, encryptedFaceId }) => {
  let lastErr;
  for (let attempt = 1; attempt <= PERSIST_RETRY_ATTEMPTS; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop -- intentional bounded retry, not a hot loop.
      const created = await FaceReferenceDeletion.create({
        userId,
        collectionId,
        encryptedFaceId,
        reason: "orphaned_index",
      });
      if (created) return created;
      lastErr = new Error("FaceReferenceDeletion.create returned no document");
    } catch (err) {
      lastErr = err;
    }
    if (attempt < PERSIST_RETRY_ATTEMPTS) {
      // eslint-disable-next-line no-await-in-loop -- intentional bounded retry, not a hot loop.
      await sleep(PERSIST_RETRY_BASE_DELAY_MS * attempt);
    }
  }

  console.error(
    "[face-reference] CRITICAL: orphaned AWS vector could not be recorded anywhere after both the " +
      "compensation delete and the recovery-record write failed — cleanup is NOT guaranteed and this " +
      "requires manual investigation.",
    { userId: String(userId || ""), collectionId },
    lastErr?.message || lastErr
  );
  return null;
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
  // below must compensate by deleting it — never leave it orphaned. Declared
  // outside the try so the catch block below can still use it (if encryption
  // itself never succeeded, it stays undefined and the catch block knows it
  // has no encrypted payload it could durably record).
  let encryptedFaceId;
  try {
    encryptedFaceId = encryptFaceId(faceId, config.faceReferenceEncryptionKey);
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
      if (result && result.failed) {
        // Retiring the OLD reference could not be durably recorded. We must
        // NOT proceed to overwrite it below — doing so would silently
        // orphan the OLD AWS vector (it would still be "active" in AWS with
        // zero local tracking left once overwritten). Leave the existing
        // reference exactly as it was, compensate the NEW vector we just
        // indexed, and fail this save cleanly instead.
        throw new Error("RETIRE_OLD_REFERENCE_FAILED");
      }
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
    let reasonCode = err?.message === "RETIRE_OLD_REFERENCE_FAILED" ? "RETIRE_OLD_REFERENCE_FAILED" : "SAVE_FAILED";
    let compensated = false;
    try {
      await rekognitionClient.deleteFaces(config.faceReferenceCollectionId, [faceId]);
      compensated = true;
    } catch (compensationErr) {
      console.error(
        "[face-reference] orphaned-vector compensation delete failed, attempting a durable recovery record:",
        compensationErr?.name || compensationErr?.code || "unknown_error"
      );
    }

    if (!compensated) {
      // Both the save AND the synchronous AWS compensation failed. Last
      // resort: persist an independent, durable FaceReferenceDeletion record
      // so the existing background retry job can still clean this vector up
      // later — never silently losing track of it. This is only possible if
      // encryption of the FaceId itself succeeded earlier.
      const deletionDoc = encryptedFaceId
        ? await persistOrphanedVectorDeletion({
            userId,
            collectionId: config.faceReferenceCollectionId,
            encryptedFaceId,
          })
        : null;

      if (deletionDoc) {
        console.error(
          "[face-reference] orphaned AWS vector recorded for retry via FaceReferenceDeletion:",
          String(deletionDoc._id)
        );
      } else {
        // persistOrphanedVectorDeletion already logged the CRITICAL details
        // when encryptedFaceId existed; if it never existed in the first
        // place (encryption itself failed), say so explicitly here instead.
        if (!encryptedFaceId) {
          console.error(
            "[face-reference] CRITICAL: orphaned AWS vector cannot be recorded (FaceId was never encrypted) — " +
              "cleanup is NOT guaranteed and this requires manual investigation."
          );
        }
        reasonCode = "ORPHANED_VECTOR_UNRECOVERABLE";
      }
    }

    await writeAudit(userId, "error", reasonCode, ip);
    return { saved: false, reasonCode };
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

  if (result.failed) {
    // The retire+persist transaction never committed after retries. The
    // reference is UNCHANGED (still active) — we must NOT report this as a
    // successful revocation, since the badge/comparison path would keep
    // treating the reference as consented. Surface it as a distinct,
    // retriable failure instead of silently claiming success.
    await writeAudit(userId, "error", "TRANSACTION_FAILED", ip);
    return { revoked: false, failed: true, reasonCode: "TRANSACTION_FAILED" };
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
 * never double-process, or lose track of, the same pending deletion. Also
 * picks up records stuck in "processing" whose lease has expired (e.g. the
 * worker that claimed them crashed before releasing the claim), so an
 * interrupted attempt is always eventually recovered automatically.
 */
const retryPendingFaceReferenceDeletions = async ({ limit = 50 } = {}) => {
  const staleLeaseBefore = new Date(Date.now() - PROCESSING_LEASE_MS);
  const pending = await FaceReferenceDeletion.find({
    $or: [{ status: "pending" }, { status: "processing", processingClaimedAt: { $lt: staleLeaseBefore } }],
  }).limit(limit);
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
  if (result.failed) {
    console.error(
      "[face-reference] CRITICAL: could not schedule deletion during account deletion (will remain for manual follow-up):",
      String(userId || "")
    );
    return { scheduled: false, failed: true };
  }
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
