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
 * Mongo filter equivalent of getAuthenticityStatus().publishEligible for the
 * Discover query. Returns null when enforcement is off (no filter at all).
 */
const buildAuthenticityDiscoverFilter = (config = getAuthenticityConfig()) => {
  if (!config.enforced || !config.newUsersFrom) return null;
  const meets = {
    emailVerified: true,
    "photoVerification.status": "verified",
    $expr: {
      $and: [
        {
          $gte: [
            {
              $size: {
                $setUnion: [
                  {
                    $filter: {
                      input: { $ifNull: ["$profilePhotos", []] },
                      as: "p",
                      cond: { $and: [{ $eq: [{ $type: "$$p" }, "string"] }, { $ne: ["$$p", ""] }] },
                    },
                  },
                  [],
                ],
              },
            },
            MIN_PUBLIC_PHOTOS,
          ],
        },
        { $eq: ["$photoVerification.verifiedPhoto", "$primaryPhoto"] },
      ],
    },
  };
  return { $or: [{ createdAt: { $lt: config.newUsersFrom } }, { createdAt: { $exists: false } }, meets] };
};

module.exports = {
  MIN_PUBLIC_PHOTOS,
  MAX_PUBLIC_PHOTOS,
  getAuthenticityConfig,
  countDistinctPublicPhotos,
  isNewUserForAuthenticity,
  getAuthenticityStatus,
  buildAuthenticityDiscoverFilter,
};
