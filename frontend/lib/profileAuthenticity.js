/**
 * "Perfil Auténtico" client helpers. Display-only: the backend derives
 * `authenticity` on every profile payload and is the sole authority on
 * publication eligibility — nothing here can mark a profile as verified.
 */
export const MIN_PUBLIC_PHOTOS = 2;

export const isProfileAuthenticityUiEnabled = () =>
  String(process.env.NEXT_PUBLIC_PROFILE_AUTHENTICITY_ENABLED || "").trim().toLowerCase() === "true";

/** True when a second distinct photo is still needed (selfie never counts). */
export const needsMorePhotos = (photoCount) => Number(photoCount) < MIN_PUBLIC_PHOTOS;

const MISSING_TO_I18N_KEY = {
  emailVerified: "profile.authenticity.missingEmail",
  minPhotos: "profile.authenticity.missingPhotos",
  selfieVerified: "profile.authenticity.missingSelfie",
};

/**
 * Maps backend `authenticity.missing` to i18n keys.
 *
 * Deliberately NOT gated on `authenticity.appliesToUser` (backend
 * enforcement + "is this a new account" status): `missing` is always
 * computed by the backend regardless of enforcement, so this helper always
 * surfaces it. Showing it is solely the caller's responsibility, gated by
 * `isProfileAuthenticityUiEnabled()` — a frontend-only display flag used to
 * preview requirements during testing. This NEVER touches Discover
 * visibility or `publishEligible`, which stay governed only by the backend.
 */
export const getAuthenticityMissingKeys = (authenticity) => {
  if (!authenticity) return [];
  return (Array.isArray(authenticity.missing) ? authenticity.missing : [])
    .map((key) => MISSING_TO_I18N_KEY[key])
    .filter(Boolean);
};
