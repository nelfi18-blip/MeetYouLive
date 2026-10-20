/**
 * Shared helper to invalidate the "Foto verificada" (photo liveness
 * verification) badge whenever a user's primary photo changes — and, when a
 * consented, reusable face reference exists ("Perfil Auténtico"), to decide
 * whether the badge can instead be CARRIED OVER to the new photo without
 * requiring a brand-new selfie.
 *
 * Verification is only meaningful for the exact primary photo that was
 * matched against the selfie — if the user swaps their main photo, any prior
 * "verified"/"pending"/"review" state must be reset so the badge never shows
 * for a photo that was never checked, UNLESS the new photo is confirmed (by
 * the backend, via Rekognition) to be the same person as the kept reference.
 */
const faceReferenceService = require("../services/faceReference.service.js");
const User = require("../models/User.js");

const buildPhotoVerificationResetOnPhotoChange = (currentUser, nextPrimaryPhoto) => {
  const currentStatus = currentUser?.photoVerification?.status || "none";
  const previousPrimaryPhoto = currentUser?.primaryPhoto || "";
  const normalizedNext = typeof nextPrimaryPhoto === "string" ? nextPrimaryPhoto : "";

  if (currentStatus === "none") return null;
  if (previousPrimaryPhoto === normalizedNext) return null;

  return {
    "photoVerification.status": "none",
    "photoVerification.verifiedPhoto": "",
    "photoVerification.verifiedAt": null,
    "photoVerification.activeSessionId": null,
  };
};

/**
 * Async superset of buildPhotoVerificationResetOnPhotoChange used by the
 * primary-photo-change routes. Behavior:
 *   - No change / never verified: identical to the sync helper (null, no-op).
 *   - Photo changed AND the user has no usable, consented face reference
 *     (feature disabled, no consent, revoked, expired, or an AWS/network
 *     error of any kind): falls back EXACTLY to the prior behavior — reset
 *     to "none", requiring a brand-new selfie. A failure here must never be
 *     able to grant a badge; it can only ever fail closed.
 *   - Photo changed AND the new photo is confirmed (by the backend) to match
 *     the kept reference above the configured threshold: keep the "Foto
 *     verificada" badge for the NEW photo, without any client-supplied or
 *     manipulated-request input ever influencing the decision — the service
 *     call below is the sole source of truth, same as the original
 *     Rekognition CompareFaces flow.
 */
const resolvePhotoVerificationOnPhotoChange = async (currentUser, nextPrimaryPhoto, { userId, ip } = {}) => {
  const baseReset = buildPhotoVerificationResetOnPhotoChange(currentUser, nextPrimaryPhoto);
  if (!baseReset) return baseReset;

  try {
    const decision = await faceReferenceService.compareAgainstReference({
      userId: userId || currentUser?._id,
      newPhotoUrl: nextPrimaryPhoto,
      ip,
    });
    if (decision.status === "verified") {
      return {
        "photoVerification.status": "verified",
        "photoVerification.verifiedPhoto": nextPrimaryPhoto,
        "photoVerification.verifiedAt": new Date(),
        "photoVerification.activeSessionId": null,
      };
    }
  } catch (err) {
    // Never let a face-reference failure throw out of a profile-photo
    // update — just fall back to requiring a new selfie, same as below.
    console.error("[photo-verification] reference comparison failed:", err?.message || err);
  }

  return baseReset;
};

/**
 * Applies a primary-photo-change's photoVerification decision with an
 * ATOMIC, version-gated write, then returns the user's up-to-date
 * `photoVerification` sub-document. This is the fix for the race condition
 * where a slow AWS comparison (compareAgainstReference, awaited inside
 * resolvePhotoVerificationOnPhotoChange) could otherwise straddle a
 * concurrent primary-photo change and grant/reset the badge for a photo
 * that is no longer current.
 *
 * Strategy ("control de versión o estrategia equivalente"): the user's own
 * `primaryPhoto` field value doubles as the version token. The write that
 * carries the AWS decision is conditioned on `primaryPhoto` in the DATABASE
 * still being EXACTLY `nextPrimaryPhoto` — the exact photo that was sent to
 * Rekognition — evaluated ATOMICALLY by MongoDB at write time, not against
 * data read earlier in the request. Two guarantees follow:
 *   1. The AWS result is only ever persisted against the exact photo that
 *      was compared (never a stale/replaced one).
 *   2. If a concurrent request already moved `primaryPhoto` on to something
 *      else while this comparison was in flight, the conditional write
 *      simply does not match and is skipped — no stale badge is granted,
 *      and the newer photo's OWN transition (computed by that other
 *      request's own call to this same function) is the only thing that
 *      can ever decide the badge for the newer photo.
 *
 * Must be called AFTER (or at least alongside) the caller's own write of
 * `primaryPhoto = nextPrimaryPhoto`, so the gate has something to match in
 * the normal (non-racing) case — callers should write every OTHER photo
 * field (avatar/profilePhotos/images/onboardingComplete) in their own
 * update and let this function own the photoVerification.* fields alone.
 */
const applyPhotoVerificationTransition = async ({ userId, currentUser, nextPrimaryPhoto, ip } = {}) => {
  const decisionFields = await resolvePhotoVerificationOnPhotoChange(currentUser, nextPrimaryPhoto, { userId, ip });

  if (!decisionFields) {
    // No transition needed (never verified before, or the photo did not
    // actually change) — the current state is already correct; avoid an
    // unnecessary DB round trip.
    const existing = currentUser?.photoVerification;
    if (!existing) return null;
    return typeof existing.toObject === "function" ? existing.toObject() : existing;
  }

  await User.updateOne({ _id: userId, primaryPhoto: nextPrimaryPhoto }, { $set: decisionFields });

  // Always return the CURRENT authoritative state from the database rather
  // than assuming our own decision is the one that stuck — if a newer photo
  // change raced ahead of us, its own transition (not ours) is correct here.
  const fresh = await User.findById(userId).select("photoVerification");
  return fresh ? fresh.toObject().photoVerification : null;
};

module.exports = {
  buildPhotoVerificationResetOnPhotoChange,
  resolvePhotoVerificationOnPhotoChange,
  applyPhotoVerificationTransition,
};
