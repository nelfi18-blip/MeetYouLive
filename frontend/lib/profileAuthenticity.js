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
 * Maps backend authenticity status to i18n keys. For profiles subject to
 * enforcement, use publicationMissing so legacy accounts subject only to
 * the two-photo gate are not falsely told to verify email or a selfie.
 * For preview-only accounts, preserve the original full requirements list.
 * This helper never controls Discover visibility or publishEligible.
 */
export const getAuthenticityMissingKeys = (authenticity) => {
  if (!authenticity) return [];
  const keys = authenticity.appliesToUser === true && Array.isArray(authenticity.publicationMissing)
    ? authenticity.publicationMissing
    : authenticity.missing;
  return (Array.isArray(keys) ? keys : [])
    .map((key) => MISSING_TO_I18N_KEY[key])
    .filter(Boolean);
};
