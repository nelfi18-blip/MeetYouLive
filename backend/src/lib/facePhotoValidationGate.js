/**
 * Shared "is this a genuinely NEW/CHANGED profile photo?" gate for the
 * face-presence validator (`facePhotoValidation.js`). Extracted so every
 * photo-mutating entry point — `user.routes.js` (avatar upload, PATCH /me,
 * /me/onboarding, /me/avatar, gallery reorder/delete) AND
 * `onboarding.controller.js` (`PUT /api/onboarding`, the endpoint the
 * onboarding frontend actually calls) — runs the exact same anti-evasion
 * diff and validation gate. Do not re-implement this logic per-route.
 */

const { getPhotoUrl, normalizePhotoUrl } = require("./photoFields.js");
const { FacePhotoValidationRejectedError, validateNewPhotoUrls } = require("./facePhotoValidation.js");

const getPhotoUrlValue = (value) => getPhotoUrl(value);

const getExistingPhotoCandidates = (user) => [
  ...(Array.isArray(user?.images) ? user.images.map(getPhotoUrlValue) : []),
  user?.primaryPhoto,
  ...(Array.isArray(user?.profilePhotos) ? user.profilePhotos : []),
  user?.avatar,
];

/**
 * Determines which photo URLs in a normalized photo state (`{ avatar,
 * primaryPhoto, profilePhotos, images }`, e.g. the output of
 * `syncCanonicalPhotoFields`/`normalizeProfilePhotos`) are genuinely NEW —
 * not already present anywhere in the user's current avatar/primaryPhoto/
 * profilePhotos/images — i.e. an actual addition or a primary-photo change,
 * never a mere reorder/removal of photos already on file. This is the
 * anti-evasion check for face-photo validation: any URL that only shows up
 * here must still pass validation even if a client tries to introduce it via
 * a PATCH/reorder/onboarding endpoint instead of the multipart upload route.
 */
const getNewlyAddedPhotoUrls = (req, currentUser, normalizedPhotoState) => {
  const previousCandidates = new Set(
    getExistingPhotoCandidates(currentUser)
      .map((candidate) => normalizePhotoUrl(req, candidate))
      .filter(Boolean)
  );
  const nextCandidates = [
    normalizedPhotoState?.avatar,
    normalizedPhotoState?.primaryPhoto,
    ...(Array.isArray(normalizedPhotoState?.profilePhotos) ? normalizedPhotoState.profilePhotos : []),
    ...(Array.isArray(normalizedPhotoState?.images) ? normalizedPhotoState.images.map(getPhotoUrlValue) : []),
  ]
    .map((candidate) => normalizePhotoUrl(req, candidate))
    .filter(Boolean);
  return [...new Set(nextCandidates)].filter((url) => !previousCandidates.has(url));
};

/**
 * Face-presence validation gate for any route that may persist new/changed
 * profile photos. No-ops entirely while `FACE_PHOTO_VALIDATION_ENABLED` is
 * off. Throws `FacePhotoValidationRejectedError` on the first new URL that
 * fails validation — callers must run this BEFORE writing anything to the
 * database or Cloudinary, and catch the error with
 * `sendFacePhotoValidationErrorIfApplicable` (or an equivalent 422 handler).
 */
const rejectNewPhotosWithoutFace = async (req, currentUser, normalizedPhotoState, { alreadyValidatedUrls } = {}) => {
  const newUrls = getNewlyAddedPhotoUrls(req, currentUser, normalizedPhotoState);
  if (newUrls.length === 0) return;
  const result = await validateNewPhotoUrls(newUrls, { alreadyValidatedUrls });
  if (!result.ok) {
    throw new FacePhotoValidationRejectedError(result.code, result.message);
  }
};

/** Sends a 422 response for a caught `FacePhotoValidationRejectedError`; returns false otherwise. */
const sendFacePhotoValidationErrorIfApplicable = (res, err) => {
  if (err?.code !== "FACE_PHOTO_VALIDATION_FAILED") return false;
  res.status(422).json({
    ok: false,
    code: err.validationCode,
    error: err.validationCode,
    message: err.message,
  });
  return true;
};

module.exports = {
  getExistingPhotoCandidates,
  getNewlyAddedPhotoUrls,
  rejectNewPhotosWithoutFace,
  sendFacePhotoValidationErrorIfApplicable,
};
