/**
 * "Perfil Auténtico" publication eligibility — computed ONLY from
 * backend-held state, never from anything the client sends.
 *
 * A NEW profile may be published in Discover only with:
 *   1. a verified email,
 *   2. at least MIN_PUBLIC_PHOTOS distinct, normalized public photos
 *      (the liveness selfie is never stored as a photo, so it never counts),
 *   3. an approved selfie liveness + face match (`photoVerification.status ===
 *      "verified"`, written only by photoVerification.service.js) that was
 *      matched against the CURRENT primary photo.
 *
 * Enforcement is OFF by default (PROFILE_AUTHENTICITY_ENFORCED) and must only
 * be switched on after the selfie flow is proven on real devices. Even when
 * on, accounts created before PROFILE_AUTHENTICITY_NEW_USERS_FROM are
 * grandfathered (gradual transition); if that cutoff is unset nobody is
 * treated as "new", so enabling the flag alone never hides existing users.
 *
 * Eligibility is derived on every read (not stored), so removing a secondary
 * photo down to one, or changing the primary photo, suspends publication
 * immediately and restores it as soon as the requirements hold again.
 */
const { normalizeUserImages } = require("./photoFields.js");

const MIN_PUBLIC_PHOTOS = 2;
const MAX_PUBLIC_PHOTOS = 6;

const getAuthenticityConfig = () => {
  const cutoffRaw = process.env.PROFILE_AUTHENTICITY_NEW_USERS_FROM || "";
  const cutoff = cutoffRaw ? new Date(cutoffRaw) : null;
  return {
    enforced: String(process.env.PROFILE_AUTHENTICITY_ENFORCED || "").trim().toLowerCase() === "true",
    newUsersFrom: cutoff && !Number.isNaN(cutoff.getTime()) ? cutoff : null,
  };
};

/** Distinct, normalized, non-empty photos (same URL never counts twice), capped at 6. */
const countDistinctPublicPhotos = (user, req) =>
  Math.min(normalizeUserImages(user || {}, req).length, MAX_PUBLIC_PHOTOS);

const isNewUserForAuthenticity = (user, config = getAuthenticityConfig()) => {
  if (!config.newUsersFrom) return false;
  const createdAt = user?.createdAt ? new Date(user.createdAt) : null;
  // Unknown creation date => treat as legacy (never remove users by accident).
  if (!createdAt || Number.isNaN(createdAt.getTime())) return false;
  return createdAt >= config.newUsersFrom;
};

const getAuthenticityStatus = (user = {}, options = {}) => {
  const config = options.config || getAuthenticityConfig();
  const photoCount = countDistinctPublicPhotos(user, options.req);
  const primary = normalizeUserImages(user, options.req)[0]?.url || "";
  const pv = user.photoVerification || {};

  const requirements = {
    emailVerified: user.emailVerified === true,
    minPhotos: photoCount >= MIN_PUBLIC_PHOTOS,
    selfieVerified:
      pv.status === "verified" && Boolean(primary) && pv.verifiedPhoto === primary,
  };
  const missing = Object.keys(requirements).filter((key) => !requirements[key]);
  const isNew = isNewUserForAuthenticity(user, config);

  return {
    enforced: config.enforced,
    appliesToUser: config.enforced && isNew,
    requirements,
    photoCount,
    minPhotos: MIN_PUBLIC_PHOTOS,
    missing,
    meetsRequirements: missing.length === 0,
    // Whether Discover may show this profile from the authenticity standpoint.
    publishEligible: !(config.enforced && isNew) || missing.length === 0,
  };
};

/**
 * Cheap, NARROWING-ONLY Mongo pre-filter for the Discover aggregation.
 *
 * This intentionally does NOT attempt to replicate photo counting/dedup in
 * MongoDB (string arrays can hold duplicate/untrimmed URLs that only
 * `countDistinctPublicPhotos` — i.e. `normalizeUserImages` — knows how to
 * collapse). Trying to mirror that logic as a separate Mongo `$expr` drifted
 * out of sync with the JS implementation in the past, so this filter only
 * keeps the two EXACT, unambiguous boolean checks (`emailVerified`,
 * `photoVerification.status`) to shrink the candidate set for performance.
 * The real, binding decision for every candidate that survives this filter
 * is always made afterwards by calling `getAuthenticityStatus` directly on
 * the fetched document — see `applyAuthenticityDiscoverFilter` below — so
 * the Mongo query and the backend's own logic can never produce different
 * results for duplicate URLs, untrimmed URLs, missing photos, or a changed
 * primary photo. Returns null when enforcement is off (no filter at all).
 */
const buildAuthenticityDiscoverFilter = (config = getAuthenticityConfig()) => {
  if (!config.enforced || !config.newUsersFrom) return null;
  const meets = { emailVerified: true, "photoVerification.status": "verified" };
  return { $or: [{ createdAt: { $lt: config.newUsersFrom } }, { createdAt: { $exists: false } }, meets] };
};

/**
 * Authoritative, exact authenticity filter for a list of real user documents
 * (the SAME `getAuthenticityStatus` used for `/me` and profile payloads —
 * never a re-implementation), returning only the ones eligible to publish.
 * Legacy/grandfathered users (per `isNewUserForAuthenticity`) always pass,
 * exactly like `getAuthenticityStatus(...).publishEligible` does elsewhere.
 */
const applyAuthenticityDiscoverFilter = (users, options = {}) => {
  const config = options.config || getAuthenticityConfig();
  if (!config.enforced) return users;
  return users.filter((user) => getAuthenticityStatus(user, { ...options, config }).publishEligible);
};

module.exports = {
  MIN_PUBLIC_PHOTOS,
  MAX_PUBLIC_PHOTOS,
  getAuthenticityConfig,
  countDistinctPublicPhotos,
  isNewUserForAuthenticity,
  getAuthenticityStatus,
  buildAuthenticityDiscoverFilter,
  applyAuthenticityDiscoverFilter,
};
