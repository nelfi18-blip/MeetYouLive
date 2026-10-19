/**
 * Shared helper to invalidate the "Foto verificada" (photo liveness
 * verification) badge whenever a user's primary photo changes.
 *
 * Verification is only meaningful for the exact primary photo that was
 * matched against the selfie — if the user swaps their main photo, any prior
 * "verified"/"pending"/"review" state must be reset so the badge never shows
 * for a photo that was never checked.
 */
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
  };
};

module.exports = { buildPhotoVerificationResetOnPhotoChange };
