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
    // previous revocation) rather than accumulating multiple AWS faces.
    const previous = await FaceReference.findOne({ userId });
    if (previous && previous.status === "active") {
      try {
        const previousFaceId = decryptFaceId(previous.encryptedFaceId, config.faceReferenceEncryptionKey);
        await rekognitionClient.deleteFaces(previous.collectionId, [previousFaceId]);
      } catch (err) {
        console.error("[face-reference] failed to delete superseded AWS face:", err?.message || err);
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
    console.error("[face-reference] failed to save reference:", err?.message || err);
    await writeAudit(userId, "error", "SAVE_FAILED", ip);
    return { saved: false, reasonCode: "SAVE_FAILED" };
  }
};

/** Returns the user's currently-usable (active, consented, unexpired) reference, or null. */
const getUsableReference = async (userId) => {
  const reference = await FaceReference.findOne({ userId, status: "active", consentWithdrawnAt: null });
  if (!reference) return null;
  if (!reference.retentionExpiresAt || reference.retentionExpiresAt.getTime() < Date.now()) {
    // Limited retention: lazily expire past-TTL references on access instead
    // of ever using a stale one. Best-effort — if this write fails, the
    // expiry check above still blocks reuse for THIS call.
    FaceReference.updateOne({ _id: reference._id, status: "active" }, { $set: { status: "expired" } }).catch(() => {});
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
 */
const revokeFaceReference = async (userId, { ip } = {}) => {
  const config = getPhotoVerificationConfig();
  const claimed = await FaceReference.findOneAndUpdate(
    { userId, status: "active" },
    { $set: { status: "revoked", consentWithdrawnAt: new Date() } },
    { new: false } // Return the PRE-update doc so we still know the FaceId to delete.
  );

  if (!claimed) {
    // Nothing active to revoke — still a successful, idempotent outcome.
    return { revoked: false };
  }

  try {
    const faceId = decryptFaceId(claimed.encryptedFaceId, config.faceReferenceEncryptionKey);
    await rekognitionClient.deleteFaces(claimed.collectionId, [faceId]);
  } catch (err) {
    // The local record is already marked revoked (so it can never be used
    // again); a failed AWS-side delete is logged but does not block the
    // user-facing success — it will not be retried automatically here.
    console.error("[face-reference] AWS deleteFaces failed during revoke:", err?.message || err);
  }

  await writeAudit(userId, "revoked", "CONSENT_WITHDRAWN", ip);
  return { revoked: true };
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

module.exports = {
  isFeatureUsable,
  saveFaceReferenceFromVerifiedSession,
  compareAgainstReference,
  revokeFaceReference,
  getFaceReferenceStatus,
};
