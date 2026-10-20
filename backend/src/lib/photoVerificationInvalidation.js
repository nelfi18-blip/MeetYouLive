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

module.exports = { buildPhotoVerificationResetOnPhotoChange, resolvePhotoVerificationOnPhotoChange };
