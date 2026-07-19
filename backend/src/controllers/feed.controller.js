const mongoose = require("mongoose");
const User = require("../models/User.js");
const Live = require("../models/Live.js");
const Like = require("../models/Like.js");
const Dislike = require("../models/Dislike.js");
const UserVisit = require("../models/UserVisit.js");
const Greeting = require("../models/Greeting.js");
const Gift = require("../models/Gift.js");
const { isLiveActuallyActive, filterActiveLives } = require("../services/live.service.js");
const { hasLiveHost } = require("../lib/socket.js");
const {
  applyDiscoveryLocationFilter,
  buildDiscoveryMatch,
  buildDiscoveryLocationMatch,
  calculateDistanceKm,
  combineDiscoveryFilters,
  getDiscoveryCompatibilityUpdates,
  getDiscoveryScope,
  getLocationCoordinates,
  normalizeDiscoveryCompatibility,
} = require("../lib/discovery.js");
const {
  getUserPhotoSelection,
  hasSerializableUserPhoto,
  withSerializedUserPhotoFields,
} = require("../lib/photoFields.js");
const {
  canAppearInFeed,
  getMissingProfileFields,
  getProfileCompletionStatus,
} = require("../lib/profileCompletion.js");

const FEED_MIX_RATIO = { live: 0.6, match: 0.4 }; // 60% live, 40% match
const DEFAULT_FEED_SIZE = 20;
const MAX_FEED_SIZE = 50;
const MAX_CLIENT_EXCLUDED_PROFILE_IDS = 200;
// Query extra candidates because final URL normalization can reject empty/unsafe photo values.
const RECOMMENDED_PROFILE_FETCH_LIMIT_WITH_PHOTO_BUFFER = 36;
// Match/top helper counts are derived from MAX_FEED_SIZE, so 2x keeps queries bounded while backfilling photo rejects.
const PHOTO_FILTER_FETCH_MULTIPLIER = 2;
// Fetch additional candidates before applying in-memory distance filtering.
const LOCATION_FILTER_FETCH_MULTIPLIER = 3;
const STAFF_ROLES = ["admin", "moderator", "support", "creator_manager", "finance", "content_reviewer"];
const FEED_PHOTO_ARRAY_FIELDS = ["profilePhotos", "photos", "images"];
const FEED_PHOTO_SCALAR_FIELDS = [
  "primaryPhoto",
  "avatar",
  "profileImage",
  "photo",
  "photoURL",
  "photoUrl",
  "image",
  "imageUrl",
  "picture",
];
const FEED_PHOTO_FIELDS = [...FEED_PHOTO_ARRAY_FIELDS, ...FEED_PHOTO_SCALAR_FIELDS].join(" ");
const FEED_PHOTO_FIELD_NAMES = FEED_PHOTO_FIELDS.split(" ");
const PHOTO_VALIDATION_STUB_REQUEST = { protocol: "https", get: () => "" };
const DEFAULT_FEED_PROFILE_NAME = "Usuario";
const FEED_PHOTO_CANDIDATE_MATCH = {
  $or: [
    ...FEED_PHOTO_ARRAY_FIELDS.map((field) => ({ [`${field}.0`]: { $exists: true } })),
    ...FEED_PHOTO_SCALAR_FIELDS.map((field) => ({ [field]: { $type: "string", $ne: "" } })),
  ],
};

const isFeedPhotoDiagnosticsEnabled = () => process.env.ENABLE_FEED_PHOTO_DIAGNOSTICS === "true";
const isFeedCandidateDiagnosticsEnabled = (req) => {
  if (process.env.ENABLE_FEED_CANDIDATE_DIAGNOSTICS === "true") return true;
  const value = String(
    req.query.debugFeedCandidates || req.query.feedDebugCandidates || req.query.diagnoseCandidates || ""
  ).toLowerCase();
  return ["1", "true", "yes"].includes(value);
};

const toObjectIdOrNull = (id) =>
  id && mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;

const parseExcludedProfileIds = (exclude) => {
  const rawValues = Array.isArray(exclude) ? exclude : [exclude];
  const ids = rawValues
    .flatMap((value) => (typeof value === "string" ? value.split(",") : []))
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, MAX_CLIENT_EXCLUDED_PROFILE_IDS)
    .map(toObjectIdOrNull)
    .filter(Boolean);
  return Array.from(new Map(ids.map((id) => [id.toString(), id])).values());
};

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
const cleanString = (value) => (typeof value === "string" ? value.trim() : "");
const cleanStringList = (value) =>
  (Array.isArray(value) ? value : [])
    .map(cleanString)
    .filter(Boolean);

const hasFeedPhoto = (user = {}) =>
  hasSerializableUserPhoto(PHOTO_VALIDATION_STUB_REQUEST, user);

const getFeedPhotoSelection = (user = {}) =>
  getUserPhotoSelection(PHOTO_VALIDATION_STUB_REQUEST, user);

const getFeedPhotoDiagnostic = (user = {}) => {
  const selection = getFeedPhotoSelection(user);
  return {
    userId: String(user._id || ""),
    username: user.username || null,
    photoCount: selection.photoCount,
    fieldUsed: selection.fieldUsed,
  };
};

const getProfileCompletionDebugValues = (user = {}, status = {}) => ({
  name: user.name || "",
  birthdate: user.birthdate || null,
  age: status.age ?? null,
  gender: user.gender || null,
  interestedIn: user.interestedIn || null,
  location: user.location || null,
  locationPoint: user.locationPoint || null,
  interests: Array.isArray(user.interests) ? user.interests : [],
  intent: user.intent || "",
  avatar: user.avatar || "",
  images: Array.isArray(user.images) ? user.images : [],
  profilePhotos: Array.isArray(user.profilePhotos) ? user.profilePhotos : [],
});

const getFeedProfileStatus = (user) => {
  if (!user) return null;
  const status = getProfileCompletionStatus(user, { req: PHOTO_VALIDATION_STUB_REQUEST });
  const missingFields = status.missingFields;
  const normalizedDiscovery = normalizeDiscoveryCompatibility(user);
  const canAppearInFeedValue = canAppearInFeed(user, {
    req: PHOTO_VALIDATION_STUB_REQUEST,
    missingFields,
  });
  const profileCompletionStatus = {
    ...status,
    onboardingComplete: canAppearInFeedValue,
    canAppearInFeed: canAppearInFeedValue,
  };
  return {
    ...profileCompletionStatus,
    onboardingComplete: canAppearInFeedValue,
    profileComplete: status.complete,
    canAppearInFeed: canAppearInFeedValue,
    missingFields,
    currentValues: getProfileCompletionDebugValues(user, profileCompletionStatus),
    interestedIn: normalizedDiscovery.interestedIn,
    gender: normalizedDiscovery.gender,
  };
};

const getFeedDiagnosticUserSummary = (user = {}) => {
  const missingFields = getMissingProfileFields(user, { req: PHOTO_VALIDATION_STUB_REQUEST });
  const summary = {
    id: String(user._id),
    role: user.role || null,
    onboardingComplete: user.onboardingComplete === true,
    profileComplete: missingFields.length === 0,
    missingFields,
    hasAge: Boolean(user.birthdate),
    hasLocation: missingFields.includes("location") === false,
    hasName: isNonEmptyString(user.name),
    hasInterests: Array.isArray(user.interests) && user.interests.length > 0,
    isBlocked: user.isBlocked === true,
    isSuspended: user.isSuspended === true,
    lastActiveAt: user.lastActiveAt || null,
  };
  if (isFeedPhotoDiagnosticsEnabled()) summary.photoDiagnosis = getFeedPhotoDiagnostic(user);
  return summary;
};

const FEED_DIAGNOSTIC_USER_FIELDS =
  `name username email role ${FEED_PHOTO_FIELDS} gender birthdate location locationPoint locationLabel interests intent interestedIn discoveryPreferences maxDistanceKm discoveryScope onboardingComplete isBlocked isSuspended lastActiveAt createdAt`;
const CURRENT_USER_FEED_FIELDS =
  `name ${FEED_PHOTO_FIELDS} gender birthdate location locationPoint locationLabel interests intent onboardingComplete role isBlocked isSuspended interestedIn discoveryPreferences maxDistanceKm discoveryScope blockedUsers`;
const FEED_DIAGNOSTIC_DEFAULT_LIMIT = 200;
const FEED_DIAGNOSTIC_MAX_LIMIT = 1000;
const RECOMMENDED_PROFILES_BASE_MATCH = {
  role: "user",
  isBlocked: false,
  isSuspended: false,
  onboardingComplete: true,
};

const buildRecommendedProfilesMatch = (excludedProfileIds = [], discoveryMatch = {}, currentUserId = null) => {
  const match = { ...RECOMMENDED_PROFILES_BASE_MATCH };
  if (excludedProfileIds.length) {
    match._id = { $nin: excludedProfileIds };
  }
  if (discoveryMatch && Object.keys(discoveryMatch).length > 0) {
    Object.assign(match, discoveryMatch);
  }
  return {
    ...match,
    $and: [
      ...(Array.isArray(match.$and) ? match.$and : []),
      ...(currentUserId ? [{ blockedUsers: { $ne: currentUserId } }] : []),
      FEED_PHOTO_CANDIDATE_MATCH,
    ],
  };
};

const pickGenderDiscoveryFilters = (discoveryMatch = {}) => {
  const filters = {};
  if (discoveryMatch.gender) filters.gender = discoveryMatch.gender;
  if (discoveryMatch.interestedIn) filters.interestedIn = discoveryMatch.interestedIn;
  return filters;
};

const buildFiltersAppliedDebug = ({ discoveryMatch = {}, locationMatch = null, ignoreExclude = false } = {}) => ({
  gender: Boolean(discoveryMatch.gender),
  reciprocalInterestedIn: Boolean(discoveryMatch.interestedIn),
  age: Boolean(discoveryMatch.birthdate),
  location: Boolean(locationMatch),
  excludedProfiles: !ignoreExclude,
});

const buildGenderPreferenceDebug = (currentUserProfile = null, discoveryMatch = {}) => ({
  interestedIn: currentUserProfile?.interestedIn || null,
  viewerGender: currentUserProfile?.gender || null,
  candidateGenderFilter: discoveryMatch.gender || null,
  reciprocalInterestedInFilter: discoveryMatch.interestedIn || null,
});

const buildRecommendedProfilesPipeline = (match, limit) => [
  { $match: match },
  {
    $addFields: {
      isBoostedNow: {
        $cond: [
          { $and: ["$boostUntil", { $gt: ["$boostUntil", new Date()] }] },
          1,
          0,
        ],
      },
      popularityScore: { $add: [{ $ifNull: ["$followersCount", 0] }, { $ifNull: ["$likesReceivedCount", 0] }] },
    },
  },
  { $sort: { isBoostedNow: -1, createdAt: -1, popularityScore: -1, _id: -1 } },
  { $limit: limit },
  {
    $project: {
      name: 1,
      displayName: 1,
      firstName: 1,
      lastName: 1,
      username: 1,
      ...Object.fromEntries(FEED_PHOTO_FIELD_NAMES.map((field) => [field, 1])),
      bio: 1,
      tags: 1,
      gender: 1,
      birthdate: 1,
      location: 1,
      interests: 1,
      intent: 1,
      isOnline: 1,
      isVerified: 1,
      isPremium: 1,
      followersCount: 1,
      createdAt: 1,
      boostUntil: 1,
      age: {
        $cond: {
          if: { $ne: ["$birthdate", null] },
          then: {
            $floor: {
              $divide: [
                { $subtract: ["$$NOW", "$birthdate"] },
                365.25 * 24 * 60 * 60 * 1000
              ]
            }
          },
          else: null
        }
      },
    },
  },
];

const serializeFeedImageFields = (req, item) => {
  const serialized = withSerializedUserPhotoFields(req, item) || {};
  const id = serialized._id || serialized.id;
  const idString = id ? String(id) : "";
  const fullName = [serialized.firstName, serialized.lastName]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .join(" ");
  const name = [serialized.displayName, serialized.name, fullName, serialized.username]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .find(Boolean) || DEFAULT_FEED_PROFILE_NAME;
  const username = typeof serialized.username === "string" && serialized.username.trim()
    ? serialized.username.trim()
    : name;
  const photos = Array.isArray(serialized.profilePhotos) ? serialized.profilePhotos.filter(Boolean) : [];
  const images = Array.isArray(serialized.images) ? serialized.images : [];
  const interestSource = Array.isArray(serialized.interests)
    ? serialized.interests
    : Array.isArray(serialized.tags)
      ? serialized.tags
      : [];
  const interests = interestSource
    .filter((interest) => typeof interest === "string" && interest.trim())
    .map((interest) => interest.trim());
  const location = typeof serialized.location === "string"
    ? serialized.location.trim()
    : [
        serialized.locationLabel,
        serialized.location?.label,
        serialized.location?.city,
        serialized.location?.country,
      ].find((value) => typeof value === "string" && value.trim())?.trim() || "";
  const numericAge = Number(serialized.age);
  const age = Number.isInteger(numericAge) && numericAge > 0 ? numericAge : null;
  const normalizedImages = images
    .map((image, index) => {
      const url = cleanString(image?.url || image);
      if (!url) return null;
      return {
        url,
        publicId: cleanString(image?.publicId),
        isPrimary: index === 0,
        source: cleanString(image?.source),
      };
    })
    .filter(Boolean);
  const primaryPhoto = cleanString(serialized.primaryPhoto) || photos[0] || normalizedImages[0]?.url || "";

  return {
    _id: idString,
    id: idString,
    name,
    username,
    avatar: cleanString(serialized.avatar) || primaryPhoto,
    images: normalizedImages,
    profilePhotos: photos,
    primaryPhoto,
    age,
    location,
    interests,
    bio: cleanString(serialized.bio),
    isOnline: serialized.isOnline === true,
    isVerified: serialized.isVerified === true,
    isPremium: serialized.isPremium === true,
    lastActiveAt: serialized.lastActiveAt || null,
  };
};

const serializeFeedProfilesWithPhotos = (req, profiles, limit) =>
  profiles
    .map((profile) => serializeFeedImageFields(req, profile))
    .filter((profile) => profile._id && Array.isArray(profile.profilePhotos) && profile.profilePhotos.length > 0)
    .slice(0, limit);

const parseFeedLimit = (value) => {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_FEED_SIZE;
  return Math.min(parsed, MAX_FEED_SIZE);
};

const serializeFeedProfilesAllowingMissingPhotos = (req, profiles, limit) =>
  profiles
    .map((profile) => serializeFeedImageFields(req, profile))
    .filter((profile) => profile._id)
    .slice(0, limit);

const getBetaFallbackProfiles = async (req, currentUserId, currentUserProfile = null, additionalExcludedProfileIds = []) => {
  const limit = parseFeedLimit(req.query.limit);
  const discoveryMatch = buildDiscoveryMatch(currentUserProfile);
  const match = {
    role: { $in: ["user", "User"] },
    isBlocked: { $ne: true },
    isSuspended: { $ne: true },
    ...pickGenderDiscoveryFilters(discoveryMatch),
    $or: [
      { name: { $exists: true, $type: "string", $ne: "" } },
      { username: { $exists: true, $type: "string", $ne: "" } },
    ],
  };
  const sanitizedExcludedIds = Array.isArray(additionalExcludedProfileIds) ? additionalExcludedProfileIds : [];
  const excludedIdsById = sanitizedExcludedIds.reduce((idsById, profileId) => {
    const objectId = toObjectIdOrNull(profileId);
    if (objectId) idsById.set(objectId.toString(), objectId);
    return idsById;
  }, new Map());

  if (currentUserId) {
    const blockedIds = currentUserProfile?.blockedUsers || [];
    [currentUserId, ...blockedIds].map(toObjectIdOrNull).filter(Boolean).forEach((id) => {
      excludedIdsById.set(id.toString(), id);
    });
    match.blockedUsers = { $ne: currentUserId };
  }
  const excludedIds = Array.from(excludedIdsById.values());
  if (excludedIds.length) {
    match._id = { $nin: excludedIds };
  }

  const profiles = await User.find(match)
    .select(
      `name displayName firstName lastName username ${FEED_PHOTO_FIELDS} bio tags gender birthdate location interests intent isOnline isVerified isPremium followersCount lastActiveAt createdAt`
    )
    .sort({ isOnline: -1, lastActiveAt: -1, createdAt: -1, _id: -1 })
    .limit(Math.min(limit * 3, MAX_FEED_SIZE * 3))
    .lean();

  return serializeFeedProfilesAllowingMissingPhotos(
    req,
    profiles.filter((profile) => cleanString(profile.name) || cleanString(profile.username)),
    limit
  );
};

// Simple in-memory cache for featured creators (they change infrequently)
let featuredCreatorsCache = null;
let featuredCreatorsCacheTime = 0;
let featuredCreatorsFetchPromise = null; // Shared promise to prevent concurrent fetches
const FEATURED_CREATORS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get featured creators with caching
 * @returns {Promise<Array>} Featured creators list
 */
async function getFeaturedCreatorsWithCache() {
  const now = Date.now();
  
  // Return cached data if still valid
  if (featuredCreatorsCache && (now - featuredCreatorsCacheTime) < FEATURED_CREATORS_CACHE_TTL) {
    console.log("[Feed API] Using cached featured creators");
    return featuredCreatorsCache;
  }
  
  // If another request is already fetching, wait for that promise
  if (featuredCreatorsFetchPromise) {
    console.log("[Feed API] Waiting for ongoing featured creators fetch");
    return featuredCreatorsFetchPromise;
  }
  
  // Create a new fetch promise
  featuredCreatorsFetchPromise = (async () => {
    try {
      console.log("[Feed API] Fetching fresh featured creators");
      const creators = await User.find({
        role: { $in: ["creator", "subCreator"] },
        creatorStatus: "approved",
        isBlocked: false,
        isSuspended: false
      })
        .sort({ earningsCoins: -1 })
        .limit(12)
        .select(`name ${FEED_PHOTO_FIELDS} earningsCoins`)
        .lean();
      
      // Update cache
      featuredCreatorsCache = creators;
      featuredCreatorsCacheTime = Date.now();
      
      return creators;
    } finally {
      // Clear the promise so next request can create a new one
      featuredCreatorsFetchPromise = null;
    }
  })();
  
  return featuredCreatorsFetchPromise;
}

/**
 * GET /api/feed
 * Returns real data for hybrid feed (live + match + creators)
 * - activeLives: Active live streams ONLY (isLive=true, no endedAt)
 * - recommendedProfiles: Regular users (NO admin, NO staff)
 * - featuredCreators: Top approved creators by earnings
 */
/**
 * Compute a single primary exclusion reason code for the feed diagnosis response.
 *
 * Checks are evaluated in priority order:
 *   1. "not_regular_user"     – role is not "user" (e.g. creator, admin, staff)
 *   2. "user_blocked"         – isBlocked is true
 *   3. "user_suspended"       – isSuspended is true
 *   4. "onboarding_incomplete"– onboardingComplete is not true
 *   5. "missing_profile_photo"– no photo found in any photo field
 *   6. "profile_incomplete"   – other required profile fields are missing
 *   7. "passes_filters"       – user passes all base feed filters
 *
 * @param {object} user         – Lean Mongoose user document.
 * @param {string[]} missingFields – Result of getMissingProfileFields(user).
 * @returns {string} Reason code.
 */
const computeFeedExclusionReason = (user, missingFields) => {
  if (user.role !== "user") return "not_regular_user";
  if (user.isBlocked === true) return "user_blocked";
  if (user.isSuspended === true) return "user_suspended";
  if (user.onboardingComplete !== true) return "onboarding_incomplete";
  if (missingFields.includes("photo")) return "missing_profile_photo";
  if (missingFields.length > 0) return "profile_incomplete";
  return "passes_filters";
};

/**
 * Build a per-user feed diagnosis object for the ?diagnose= query param.
 * Only included in the /api/feed response when the requesting user is an admin.
 *
 * @param {import('express').Request} req              – Express request (used to normalise image URLs).
 * @param {object} diagnoseTarget                      – Lean Mongoose user document for the target.
 * @param {Set<string>} returnedProfileIdSet           – IDs of profiles actually returned in this feed response.
 * @param {Set<string>} excludedProfileIdSet           – IDs excluded server-side (liked + self + client-provided).
 * @returns {object} Diagnosis object with visibleInFeed, reason, missingProfileFields, photoDiagnosis, etc.
 *                   Returns null only when diagnoseTarget is falsy (caller handles the not-found case separately).
 */
const buildFeedDiagnosis = (req, diagnoseTarget, returnedProfileIdSet, excludedProfileIdSet) => {
  if (!diagnoseTarget) return null;

  const missingFields = getMissingProfileFields(diagnoseTarget, { req });
  const passesBaseFilters =
    diagnoseTarget.role === "user" &&
    diagnoseTarget.isBlocked !== true &&
    diagnoseTarget.isSuspended !== true &&
    diagnoseTarget.onboardingComplete === true &&
    missingFields.length === 0;

  const targetIdStr = String(diagnoseTarget._id);
  const isExcludedByViewer = excludedProfileIdSet.has(targetIdStr);
  const isReturnedByFeed = returnedProfileIdSet.has(targetIdStr);

  let reason = computeFeedExclusionReason(diagnoseTarget, missingFields);
  if (reason === "passes_filters") {
    if (isExcludedByViewer) reason = "excluded_by_viewer_or_already_liked";
    else if (!isReturnedByFeed) reason = "passes_filters_not_in_top_results";
    else reason = "visible_in_feed";
  }

  // Collect raw photo field values for image diagnosis
  const photoFields = {
    avatar: diagnoseTarget.avatar || null,
    profileImage: diagnoseTarget.profileImage || null,
    photo: diagnoseTarget.photo || null,
    profilePhotos: diagnoseTarget.profilePhotos || [],
    photos: diagnoseTarget.photos || [],
  };

  // Resolve the best available avatar URL using the same fallback order as the feed serialiser.
  const photoSelection = getUserPhotoSelection(req, diagnoseTarget);

  return {
    userId: targetIdStr,
    email: diagnoseTarget.email || null,
    username: diagnoseTarget.username || null,
    visibleInFeed: reason === "visible_in_feed",
    reason,
    passesBaseFilters,
    isReturnedByFeed,
    isExcludedByViewer,
    missingProfileFields: missingFields,
    photoDiagnosis: {
      hasPhoto: !missingFields.includes("photo"),
      normalizedAvatarUrl: photoSelection.primaryPhoto || null,
      photoCount: photoSelection.photoCount,
      fieldUsed: photoSelection.fieldUsed,
      rawPhotoFields: photoFields,
    },
    profileSummary: getFeedDiagnosticUserSummary(diagnoseTarget),
  };
};

const valueMatchesMongoIn = (value, filter) => {
  if (!filter?.$in) return true;
  return filter.$in.includes(value);
};

const birthdateMatchesMongoRange = (birthdate, filter) => {
  if (!filter) return true;
  const candidateBirthdate = birthdate ? new Date(birthdate) : null;
  if (!candidateBirthdate || Number.isNaN(candidateBirthdate.getTime())) return false;
  if (filter.$lte && candidateBirthdate > filter.$lte) return false;
  if (filter.$gte && candidateBirthdate < filter.$gte) return false;
  return true;
};

const hasLocationPoint = (user = {}) => {
  const coordinates = Array.isArray(user.locationPoint?.coordinates) ? user.locationPoint.coordinates : [];
  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  return Number.isFinite(lng) && Number.isFinite(lat);
};

const isExcludedByNearbyLocation = (viewer, user) => {
  if (!viewer) return false;
  if (getDiscoveryScope(viewer) !== "nearby") return false;
  const viewerCoordinates = getLocationCoordinates(viewer);
  const candidateCoordinates = getLocationCoordinates(user);
  const rawMaxDistanceKm =
    viewer.maxDistanceKm !== undefined && viewer.maxDistanceKm !== null
      ? viewer.maxDistanceKm
      : viewer.discoveryPreferences?.maxDistanceKm;
  const maxDistanceKm = Number(rawMaxDistanceKm);
  if (!viewerCoordinates || !candidateCoordinates || !Number.isFinite(maxDistanceKm) || maxDistanceKm <= 0) {
    return false;
  }
  const distanceKm = calculateDistanceKm(viewerCoordinates, candidateCoordinates);
  return distanceKm !== null && distanceKm > maxDistanceKm;
};

const isExcludedByDiscoveryLocation = (viewer, user) => {
  if (!viewer) return false;
  const scope = getDiscoveryScope(viewer);
  if (scope === "nearby") return isExcludedByNearbyLocation(viewer, user);
  if (scope !== "country") return false;

  const filteredCandidates = applyDiscoveryLocationFilter(viewer, [user]);
  return filteredCandidates.length === 0;
};

const getZeroCandidateExcludedReason = (user, context) => {
  const userId = String(user._id);
  const discoveryMatch = context.discoveryMatch || {};
  const missingFields = getMissingProfileFields(user, { req: context.req });
  const canAppearInFeedValue = canAppearInFeed(user, {
    req: context.req,
    missingFields,
  });

  if (context.returnedProfileIds.has(userId)) return "includedInFeed";
  if (
    user.role !== "user" ||
    user.isBlocked === true ||
    user.isSuspended === true ||
    user.onboardingComplete !== true ||
    canAppearInFeedValue !== true
  ) {
    return "excludedIncomplete";
  }
  if (context.viewerId && userId === context.viewerId) return "excludedSelf";
  if (!valueMatchesMongoIn(user.gender, discoveryMatch.gender)) return "excludedByGender";
  if (!valueMatchesMongoIn(user.interestedIn, discoveryMatch.interestedIn)) return "excludedByInterestedIn";
  if (!birthdateMatchesMongoRange(user.birthdate, discoveryMatch.birthdate)) return "excludedByAge";
  if (isExcludedByDiscoveryLocation(context.viewer, user)) return "excludedByDistance";
  if (context.clientExcludedProfileIds.has(userId)) return "excludedAlreadySeen";
  if (context.likedProfileIds.has(userId)) return "excludedAlreadyLiked";
  if (context.dislikedProfileIds?.has(userId)) return "excludedAlreadyDisliked";
  return "eligibleNotReturned";
};

const buildZeroCandidateDiagnostics = async (req, context) => {
  const excludedUsersLimit = FEED_DIAGNOSTIC_MAX_LIMIT;
  const totalUsers = await User.countDocuments({});
  const debug = {
    totalUsers,
    eligibleUsers: 0,
    excludedSelf: 0,
    excludedIncomplete: 0,
    excludedByGender: 0,
    excludedByInterestedIn: 0,
    excludedByAge: 0,
    excludedByDistance: 0,
    excludedAlreadySeen: 0,
    excludedAlreadyLiked: 0,
    excludedAlreadyDisliked: 0,
    finalCandidatesCount: context.returnedProfileIds.size,
  };

  const excludedUsers = [];
  let excludedUsersCount = 0;
  const diagnosticUsers = User.find({})
    .select(FEED_DIAGNOSTIC_USER_FIELDS)
    .sort({ createdAt: -1, _id: -1 })
    .lean()
    .cursor();

  for await (const user of diagnosticUsers) {
    const missingFields = getMissingProfileFields(user, { req });
    const canAppearInFeedValue = canAppearInFeed(user, { req, missingFields });
    if (
      user.role === "user" &&
      user.isBlocked !== true &&
      user.isSuspended !== true &&
      user.onboardingComplete === true &&
      canAppearInFeedValue === true
    ) {
      debug.eligibleUsers += 1;
    }

    const excludedReason = getZeroCandidateExcludedReason(user, {
      ...context,
      req,
    });
    if (excludedReason === "includedInFeed") continue;
    if (Object.hasOwn(debug, excludedReason)) {
      debug[excludedReason] += 1;
    }

    const excludedUser = {
      username: user.username || null,
      canAppearInFeed: canAppearInFeedValue,
      onboardingComplete: user.onboardingComplete === true,
      missingFields,
      excludedReason,
    };
    excludedUsersCount += 1;
    if (excludedUsers.length < excludedUsersLimit) {
      excludedUsers.push(excludedUser);
    }
  }

  return {
    ...debug,
    excludedUsers,
    excludedUsersCount,
    excludedUsersLimit,
    excludedUsersTruncated: excludedUsersCount > excludedUsersLimit,
  };
};

const getFeedCandidateExcludedReason = (user, context) => {
  const userId = String(user._id);
  const canAppear = context.canAppearInFeed;
  const discoveryMatch = context.discoveryMatch || {};

  if (context.returnedProfileIds.has(userId)) return "included_in_feed";
  if (user.role !== "user") return "role_not_user";
  if (user.isBlocked === true) return "user_blocked";
  if (user.isSuspended === true) return "user_suspended";
  if (user.onboardingComplete !== true) return "onboarding_incomplete";
  if (!canAppear) return "canAppearInFeed_false";
  if (!valueMatchesMongoIn(user.gender, discoveryMatch.gender)) return "excludedByGenderPreference";
  if (!valueMatchesMongoIn(user.interestedIn, discoveryMatch.interestedIn)) {
    return "excludedByInterestedInPreference";
  }
  if (!birthdateMatchesMongoRange(user.birthdate, discoveryMatch.birthdate)) return "excludedByAgeRange";
  if (context.likedProfileIds.has(userId)) return "excludedAlreadyLiked";
  if (context.clientExcludedProfileIds.has(userId)) return "excludedAlreadyDisliked";
  if (context.viewerId && userId === context.viewerId) return "excludedSelf";
  if (isExcludedByNearbyLocation(context.viewer, user)) return "excludedByLocationDistance";
  return "eligible_not_returned";
};

const buildFeedCandidateDiagnostics = (req, users, context) => {
  const summaryCounterByReason = {
    role_not_user: "excludedIncomplete",
    user_blocked: "excludedIncomplete",
    user_suspended: "excludedIncomplete",
    onboarding_incomplete: "excludedIncomplete",
    canAppearInFeed_false: "excludedIncomplete",
    excludedByGenderPreference: "excludedByGenderPreference",
    excludedByInterestedInPreference: "excludedByInterestedInPreference",
    excludedByAgeRange: "excludedByAgeRange",
    excludedAlreadyLiked: "excludedAlreadyLiked",
    excludedAlreadyDisliked: "excludedAlreadyDisliked",
    excludedSelf: "excludedSelf",
    excludedByLocationDistance: "excludedByLocationDistance",
  };
  const summary = {
    totalUsers: context.totalUsers,
    totalEligibleBeforeViewerFilters: 0,
    excludedIncomplete: 0,
    excludedByGenderPreference: 0,
    excludedByInterestedInPreference: 0,
    excludedByAgeRange: 0,
    excludedAlreadyLiked: 0,
    excludedAlreadyDisliked: 0,
    excludedSelf: 0,
    excludedByLocationDistance: 0,
    finalCandidatesCount: context.returnedProfileIds.size,
  };

  const excludedCandidates = [];

  users.forEach((user) => {
    const missingFields = getMissingProfileFields(user, { req });
    const canAppearInFeedValue = canAppearInFeed(user, { req, missingFields });
    const eligibleBeforeViewerFilters =
      user.role === "user" &&
      user.isBlocked !== true &&
      user.isSuspended !== true &&
      user.onboardingComplete === true &&
      canAppearInFeedValue === true;

    if (eligibleBeforeViewerFilters) summary.totalEligibleBeforeViewerFilters += 1;

    const excludedReason = getFeedCandidateExcludedReason(user, {
      ...context,
      canAppearInFeed: canAppearInFeedValue,
    });

    if (excludedReason === "included_in_feed") return;
    const summaryCounter = summaryCounterByReason[excludedReason];
    if (summaryCounter) summary[summaryCounter] += 1;

    excludedCandidates.push({
      userId: String(user._id),
      username: user.username || null,
      onboardingComplete: user.onboardingComplete === true,
      canAppearInFeed: canAppearInFeedValue,
      missingFields,
      hasPrimaryPhoto: hasFeedPhoto(user),
      hasLocationPoint: hasLocationPoint(user),
      hasGender: isNonEmptyString(user.gender),
      hasInterestedIn: isNonEmptyString(user.interestedIn),
      hasBirthdate: Boolean(user.birthdate),
      hasIntent: isNonEmptyString(user.intent),
      hasInterests: Array.isArray(user.interests) && user.interests.length > 0,
      excludedReason,
    });
  });

  return { summary, excludedCandidates };
};

const getFeed = async (req, res) => {
  const startTime = Date.now();
  try {
    console.log("[Feed API] Fetching feed data...");

    const authenticatedUserId = toObjectIdOrNull(req.userId);
    const diagnoseUserId = toObjectIdOrNull(req.query.diagnose);
    const ignoreExclude = req.query.ignoreExclude === "true";

    const clientExcludedObjectIds = ignoreExclude ? [] : parseExcludedProfileIds(req.query.exclude);
    const clientExcludedProfileIds = new Set(clientExcludedObjectIds.map((profileId) => profileId.toString()));
    const excludedProfileIdsById = new Map(
      clientExcludedObjectIds.map((profileId) => [profileId.toString(), profileId])
    );
    const addExcludedProfileId = (profileId) => {
      const objectId = toObjectIdOrNull(profileId);
      if (objectId) excludedProfileIdsById.set(objectId.toString(), objectId);
    };
    let likedProfileIdsRaw = [];
    let dislikedProfileIdsRaw = [];
    if (authenticatedUserId) {
      addExcludedProfileId(authenticatedUserId);
      if (!ignoreExclude) {
        [likedProfileIdsRaw, dislikedProfileIdsRaw] = await Promise.all([
          Like.distinct("to", { from: authenticatedUserId }),
          Dislike.distinct("to", { from: authenticatedUserId }),
        ]);
        likedProfileIdsRaw.forEach(addExcludedProfileId);
        dislikedProfileIdsRaw.forEach(addExcludedProfileId);
      }
    }
    const currentUserProfilePromise = authenticatedUserId
      ? User.findById(authenticatedUserId)
          .select(CURRENT_USER_FEED_FIELDS)
          .lean()
      : Promise.resolve(null);

    // Run independent queries in parallel for better performance
    let [allLives, featuredCreators, currentUserProfile] = await Promise.all([
      // 🔴 Active live streams ONLY - fetch more than 12 to account for filtering
      Live.find({
        isLive: true,
        endedAt: null
      })
        .sort({ viewerCount: -1 })
        .limit(30) // Fetch more to ensure we get 12 after filtering
        .populate("user", `username name ${FEED_PHOTO_FIELDS} role creatorStatus`)
        .lean(),
      // ⭐ Featured creators - use cached function (data changes infrequently)
      getFeaturedCreatorsWithCache(),
      currentUserProfilePromise,
    ]);
    if (currentUserProfile) {
      const compatibilityUpdates = getDiscoveryCompatibilityUpdates(currentUserProfile);
      currentUserProfile = normalizeDiscoveryCompatibility(currentUserProfile);
      if (Object.keys(compatibilityUpdates).length > 0) {
        User.updateOne({ _id: currentUserProfile._id }, { $set: compatibilityUpdates }).catch(() => {});
      }
      (currentUserProfile.blockedUsers || []).forEach(addExcludedProfileId);
      const profileCompletion = getFeedProfileStatus(currentUserProfile);
      if (profileCompletion?.canAppearInFeed === true && currentUserProfile.onboardingComplete !== true) {
        currentUserProfile.onboardingComplete = true;
        User.updateOne({ _id: currentUserProfile._id }, { $set: { onboardingComplete: true } }).catch(() => {});
      }
    }

    let discoveryMatch = {};
    let locationMatch = null;
    let strictFeedError = null;
    let recommendedProfilesPrimary = [];
    // Finalize after currentUserProfile loads so personal blocks are included.
    const allExcludedProfileIds = Array.from(excludedProfileIdsById.values());
    try {
      discoveryMatch = buildDiscoveryMatch(currentUserProfile);
      locationMatch = buildDiscoveryLocationMatch(currentUserProfile);
      const combinedDiscoveryMatch = combineDiscoveryFilters(discoveryMatch, locationMatch);
      const recommendedProfilesMatch = buildRecommendedProfilesMatch(allExcludedProfileIds, combinedDiscoveryMatch, authenticatedUserId);
      recommendedProfilesPrimary = await User.aggregate(
        buildRecommendedProfilesPipeline(
          recommendedProfilesMatch,
          RECOMMENDED_PROFILE_FETCH_LIMIT_WITH_PHOTO_BUFFER * LOCATION_FILTER_FETCH_MULTIPLIER
        )
      );
    } catch (error) {
      strictFeedError = error;
      console.error("[Feed API] Strict feed failed, using beta fallback:", error.message);
    }

    // Apply active live filter FIRST to ensure only truly active streams
    const activeLives = filterActiveLives(allLives);

    // Filter out staff roles and ensure only approved creators with active Socket.io connection
    const filteredLives = activeLives
      .filter((live) => {
        if (!live.user) return false;
        const userRole = live.user.role;
        // Exclude all staff roles
        if (STAFF_ROLES.includes(userRole)) return false;
        // Only include approved creators or subCreators
        const isApprovedCreator = (userRole === "creator" || userRole === "subCreator") && 
                                  live.user.creatorStatus === "approved";
        return isApprovedCreator;
      })
      // CRITICAL: Only include streams with active host Socket.io connection
      .filter((live) => hasLiveHost(String(live._id)))
      .slice(0, 12); // Take only first 12 after filtering

    const serializedLives = filteredLives.map((live) => ({
      ...live,
      user: serializeFeedImageFields(req, live.user),
    }));
    const locationFilteredProfiles = strictFeedError
      ? []
      : applyDiscoveryLocationFilter(currentUserProfile, recommendedProfilesPrimary);
    let serializedRecommendedProfiles = serializeFeedProfilesWithPhotos(req, locationFilteredProfiles, 12);
    const serializedFeaturedCreators = featuredCreators.map((creator) =>
      serializeFeedImageFields(req, creator)
    );
    const strictProfileCount = serializedRecommendedProfiles.length;
    let feedMode = "strict";
    let fallbackDebug = null;
    let returnedProfileIdSet = new Set(serializedRecommendedProfiles.map((profile) => String(profile._id)));
    let zeroCandidateDebug = null;
    if (strictFeedError || strictProfileCount === 0) {
      if (strictFeedError) {
        zeroCandidateDebug = {
          reason: "strict_feed_failed",
          message: strictFeedError.message,
        };
      } else {
        zeroCandidateDebug = await buildZeroCandidateDiagnostics(req, {
          viewer: currentUserProfile,
          viewerId: authenticatedUserId ? authenticatedUserId.toString() : "",
          likedProfileIds: new Set(likedProfileIdsRaw.map((profileId) => String(profileId)).filter(Boolean)),
          dislikedProfileIds: new Set(dislikedProfileIdsRaw.map((profileId) => String(profileId)).filter(Boolean)),
          clientExcludedProfileIds,
          returnedProfileIds: returnedProfileIdSet,
          discoveryMatch,
        });
        const { excludedUsers, ...zeroCandidateSummary } = zeroCandidateDebug;
        console.log("[Feed Zero Candidate Diagnostics]", JSON.stringify(zeroCandidateSummary));
        console.log("[Feed Zero Candidate Excluded Users]", JSON.stringify(excludedUsers));
      }

      serializedRecommendedProfiles = await getBetaFallbackProfiles(
        req,
        authenticatedUserId,
        currentUserProfile,
        allExcludedProfileIds
      );
      feedMode = "betaFallback";
      returnedProfileIdSet = new Set(serializedRecommendedProfiles.map((profile) => String(profile._id)));
      fallbackDebug = {
        strictCount: strictProfileCount,
        fallbackCount: serializedRecommendedProfiles.length,
        ignoreExclude,
        strictError: strictFeedError ? strictFeedError.message : "",
      };
    }
    if (isFeedCandidateDiagnosticsEnabled(req)) {
      const diagnosticLimit = Math.min(
        Math.max(parseInt(req.query.debugFeedCandidatesLimit, 10) || FEED_DIAGNOSTIC_DEFAULT_LIMIT, 1),
        FEED_DIAGNOSTIC_MAX_LIMIT
      );
      const [totalUsers, diagnosticUsers] = await Promise.all([
        User.countDocuments({}),
        User.find({})
          .select(FEED_DIAGNOSTIC_USER_FIELDS)
          .sort({ createdAt: -1, _id: -1 })
          .limit(diagnosticLimit)
          .lean(),
      ]);
      const feedCandidateDiagnostics = buildFeedCandidateDiagnostics(req, diagnosticUsers, {
        totalUsers,
        viewer: currentUserProfile,
        viewerId: authenticatedUserId ? authenticatedUserId.toString() : "",
        likedProfileIds: new Set(likedProfileIdsRaw.map((profileId) => String(profileId)).filter(Boolean)),
        clientExcludedProfileIds,
        returnedProfileIds: returnedProfileIdSet,
        discoveryMatch,
      });
      feedCandidateDiagnostics.diagnosticUsersLimit = diagnosticLimit;
      console.debug("[Feed Candidate Diagnostics]", JSON.stringify(feedCandidateDiagnostics));
    }

    // Build optional admin-only diagnosis
    let diagnosis = undefined;
    if (diagnoseUserId) {
      if (!currentUserProfile || currentUserProfile.role !== "admin") {
        diagnosis = { message: "Only admins can use the diagnose parameter" };
      } else {
        const diagnoseTarget = await User.findById(diagnoseUserId).select(FEED_DIAGNOSTIC_USER_FIELDS).lean();
        const excludedProfileIdSet = new Set(excludedProfileIdsById.keys());
        diagnosis = diagnoseTarget
          ? buildFeedDiagnosis(req, diagnoseTarget, returnedProfileIdSet, excludedProfileIdSet)
          : { userId: diagnoseUserId.toString(), visibleInFeed: false, reason: "not_found", profileSummary: null };
      }
    }

    const responseTime = Date.now() - startTime;
    const filtersApplied = buildFiltersAppliedDebug({ discoveryMatch, locationMatch, ignoreExclude });
    const genderPreference = buildGenderPreferenceDebug(currentUserProfile, discoveryMatch);
    const matchedProfiles = serializedRecommendedProfiles.length;
    const fallbackUsed = feedMode === "betaFallback";
    console.log(`[Feed API] Response ready in ${responseTime}ms:`, {
      feedMode,
      filtersApplied,
      genderPreference,
      matchedProfiles,
      fallbackUsed,
      activeLives: serializedLives.length,
      recommendedProfiles: matchedProfiles,
      featuredCreators: serializedFeaturedCreators.length
    });

    res.set("Cache-Control", "no-store");
    const viewerProfileStatus = getFeedProfileStatus(currentUserProfile);
    const responseBody = {
      success: true,
      feedMode,
      reason: feedMode === "betaFallback"
        ? "No hubo candidatos con filtros estrictos. Mostrando usuarios de prueba en modo Beta."
        : "",
      debug: {
        ...(zeroCandidateDebug || {}),
        ...(fallbackDebug || {}),
        feedMode,
        filtersApplied,
        genderPreference,
        matchedProfiles,
        fallbackUsed,
        ignoreExclude,
      },
      activeLives: serializedLives,
      recommendedProfiles: serializedRecommendedProfiles,
      profiles: serializedRecommendedProfiles,
      featuredCreators: serializedFeaturedCreators,
      viewerProfileStatus,
      canAppearInFeed: viewerProfileStatus?.canAppearInFeed ?? null,
      onboardingComplete: viewerProfileStatus?.onboardingComplete ?? null,
      missingFields: viewerProfileStatus?.missingFields || [],
      profileCompletionStatus: viewerProfileStatus,
    };
    if (diagnosis !== undefined) responseBody.diagnosis = diagnosis;
    res.json(responseBody);
  } catch (error) {
    const errorTime = Date.now() - startTime;
    console.error(`[Feed API] Error loading feed after ${errorTime}ms:`, error.message);
    
    // Only log stack trace in development to prevent information disclosure
    if (process.env.NODE_ENV !== "production") {
      console.error("[Feed API] Error stack:", error.stack);
    }
    
    const message = process.env.NODE_ENV === "production"
      ? "Error al cargar el feed"
      : `Error al cargar el feed: ${error.message}`;
    try {
      const ignoreExclude = req.query.ignoreExclude === "true";
      const authenticatedUserId = toObjectIdOrNull(req.userId);
      const fallbackViewerProfile = authenticatedUserId
        ? await User.findById(authenticatedUserId)
            .select("gender interestedIn discoveryPreferences maxDistanceKm discoveryScope")
            .lean()
            .then((profile) => normalizeDiscoveryCompatibility(profile))
            .catch(() => null)
        : null;
      const fallbackDiscoveryMatch = buildDiscoveryMatch(fallbackViewerProfile);
      const fallbackExcludedIds = [authenticatedUserId, ...parseExcludedProfileIds(req.query.exclude)].filter(Boolean);
      if (authenticatedUserId && !ignoreExclude) {
        const [fallbackLikedProfileIds, fallbackDislikedProfileIds] = await Promise.all([
          Like.distinct("to", { from: authenticatedUserId }).catch(() => []),
          Dislike.distinct("to", { from: authenticatedUserId }).catch(() => []),
        ]);
        [...fallbackLikedProfileIds, ...fallbackDislikedProfileIds].forEach((profileId) => {
          const objectId = toObjectIdOrNull(profileId);
          if (objectId) fallbackExcludedIds.push(objectId);
        });
      }
      const fallbackProfiles = await getBetaFallbackProfiles(
        req,
        authenticatedUserId,
        fallbackViewerProfile,
        fallbackExcludedIds
      );
      const matchedProfiles = fallbackProfiles.length;
      res.set("Cache-Control", "no-store");
      return res.json({
        success: true,
        feedMode: "betaFallback",
        reason: "El feed estricto falló. Mostrando usuarios de prueba en modo Beta.",
        debug: {
          feedMode: "betaFallback",
          filtersApplied: buildFiltersAppliedDebug({
            discoveryMatch: fallbackDiscoveryMatch,
            ignoreExclude,
          }),
          genderPreference: buildGenderPreferenceDebug(fallbackViewerProfile, fallbackDiscoveryMatch),
          matchedProfiles,
          fallbackUsed: true,
          strictError: error.message,
          fallbackCount: matchedProfiles,
          ignoreExclude,
        },
        recommendedProfiles: fallbackProfiles,
        profiles: fallbackProfiles,
        activeLives: [],
        featuredCreators: [],
      });
    } catch (fallbackError) {
      console.error("[Feed API] Beta fallback failed:", fallbackError.message);
    }
    res.status(500).json({
      success: false,
      message,
      feedMode: "betaFallback",
      reason: message,
      debug: { strictError: error.message },
      recommendedProfiles: [],
      profiles: [],
      activeLives: [],
      featuredCreators: [],
    });
  }
};

/**
 * GET /api/feed/hybrid
 * Returns an intelligent mix of live streams and match profiles
 * - 60% Live content (active streams from approved creators)
 * - 40% Match profiles (regular users for dating)
 * Priority: Verified creators → Active streams → New users
 */
const getHybridFeed = async (req, res) => {
  try {
    const userId = req.userId;
    const { limit = DEFAULT_FEED_SIZE } = req.query;
    const feedSize = Math.min(parseInt(limit, 10) || DEFAULT_FEED_SIZE, MAX_FEED_SIZE);

    // Calculate split
    const liveCount = Math.ceil(feedSize * FEED_MIX_RATIO.live);
    const matchCount = Math.floor(feedSize * FEED_MIX_RATIO.match);

    // Fetch user's existing likes to exclude from match feed
    const userLikes = await Like.find({ from: userId }).select("to").lean();
    const likedIds = userLikes.map((l) => l.to.toString());

    // Parallel fetch: live streams and match profiles
    const [liveStreams, matchProfiles] = await Promise.all([
      getLiveStreams(req, liveCount, userId),
      getMatchProfiles(req, matchCount, userId, likedIds),
    ]);

    // Intelligent mixing: prioritize content
    const feed = intelligentMix(liveStreams, matchProfiles, feedSize);

    res.json({
      ok: true,
      feed,
      stats: {
        totalItems: feed.length,
        liveCount: feed.filter((item) => item.type === "live").length,
        matchCount: feed.filter((item) => item.type === "match").length,
      },
    });
  } catch (err) {
    console.error("Hybrid feed error:", err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Fetch live streams with priority sorting
 * Priority: Verified creators > High viewer count > New streams
 */
const getLiveStreams = async (req, count, currentUserId) => {
  try {
    const lives = await Live.find({ isLive: true, endedAt: null })
      .populate("user", `username name ${FEED_PHOTO_FIELDS} role creatorStatus isVerifiedCreator followersCount`)
      .select("-streamKey -paidViewers")
      .lean();

    // Apply active live filter FIRST
    const trulyActiveLives = filterActiveLives(lives);

    // Filter and validate active lives
    const activeLives = trulyActiveLives
      .filter((live) => live && live._id && live.user)
      .filter((live) => {
        const userRole = live.user?.role;
        // Exclude all staff roles (admin/moderator/support/creator_manager/finance/content_reviewer)
        if (STAFF_ROLES.includes(userRole)) return false;
        const approved = (userRole === "creator" || userRole === "subCreator") && live.user?.creatorStatus === "approved";
        return approved && isLiveActuallyActive(live);
      })
      // CRITICAL: Only include streams with active host Socket.io connection
      .filter((live) => hasLiveHost(String(live._id)));

    // Get total coins earned for each live (for sorting)
    const liveIds = activeLives.map((l) => l._id);
    const coinsData = await Gift.aggregate([
      { $match: { liveId: { $in: liveIds } } },
      { $group: { _id: "$liveId", totalCoins: { $sum: "$coinCost" } } },
    ]);

    const coinsMap = new Map();
    coinsData.forEach((c) => {
      coinsMap.set(c._id.toString(), c.totalCoins || 0);
    });

    // Enrich lives with coins data and calculate priority score
    const enrichedLives = activeLives.map((live) => {
      const totalCoinsEarned = coinsMap.get(String(live._id)) || 0;
      const isVerified = live.user?.isVerifiedCreator || false;
      const viewerCount = live.viewerCount || 0;
      const isNew = live.createdAt ? (Date.now() - new Date(live.createdAt).getTime()) < 10 * 60 * 1000 : false;

      // Priority score calculation
      let priority = 0;
      if (isVerified) priority += 1000; // Verified creators get highest priority
      priority += viewerCount * 10; // Active viewers boost
      priority += totalCoinsEarned; // Earning streams boost
      if (isNew) priority += 500; // New streams get boosted

      return {
        ...live,
        user: serializeFeedImageFields(req, live.user),
        totalCoinsEarned,
        priority,
        type: "live",
      };
    });

    // Sort by priority and return top N
    enrichedLives.sort((a, b) => b.priority - a.priority);
    return enrichedLives.slice(0, count);
  } catch (err) {
    console.error("Error fetching live streams:", err);
    return [];
  }
};

/**
 * Fetch match profiles with priority sorting
 * Priority: New users > Active users > Users with complete profiles
 * Excludes: Already liked users, creators, self, blocked users
 */
const getMatchProfiles = async (req, count, currentUserId, likedIds) => {
  try {
    // Fetch current user's data for filtering
    const currentUser = await User.findById(currentUserId)
      .select("gender birthdate location locationLabel blockedUsers interestedIn discoveryPreferences maxDistanceKm discoveryScope")
      .lean();

    if (!currentUser) return [];

    const blockedUsers = currentUser.blockedUsers || [];
    const excludeIds = [
      ...likedIds,
      ...blockedUsers.map((id) => id.toString()),
      currentUserId.toString(),
    ];
    const discoveryMatch = buildDiscoveryMatch(currentUser);
    const locationMatch = buildDiscoveryLocationMatch(currentUser);
    const combinedDiscoveryMatch = combineDiscoveryFilters(discoveryMatch, locationMatch);

    // Find potential matches (regular users, not creators)
    const users = await User.find({
      $and: [
        {
          _id: { $nin: excludeIds },
          blockedUsers: { $ne: currentUserId },
          role: "user", // Only regular users in match feed
          onboardingComplete: true,
          isBlocked: false,
          isSuspended: false,
          username: { $ne: null },
          ...combinedDiscoveryMatch,
        },
        FEED_PHOTO_CANDIDATE_MATCH,
      ],
    })
      .select(`username name ${FEED_PHOTO_FIELDS} bio gender birthdate location locationLabel interests intent isVerifiedCreator createdAt`)
      .limit(count * PHOTO_FILTER_FETCH_MULTIPLIER * LOCATION_FILTER_FETCH_MULTIPLIER)
      .lean();

    const locationFilteredUsers = applyDiscoveryLocationFilter(currentUser, users);
    const serializedUsersWithPhotos = locationFilteredUsers
      .map((user) => serializeFeedImageFields(req, user))
      .filter((user) => Array.isArray(user.profilePhotos) && user.profilePhotos.length > 0);

    // Calculate priority for each user
    const enrichedUsers = serializedUsersWithPhotos.map((user) => {
      const isNew = user.createdAt ? (Date.now() - new Date(user.createdAt).getTime()) < 7 * 24 * 60 * 60 * 1000 : false; // New = less than 7 days
      const hasCompleteProfile = user.bio && user.location && user.interests && user.interests.length > 0;

      // Priority score
      let priority = 0;
      if (isNew) priority += 800; // New users boosted
      if (hasCompleteProfile) priority += 300; // Complete profiles boosted
      priority += Math.random() * 100; // Add randomness for variety

      return {
        ...user,
        priority,
        type: "match",
        tags: generateTags(user, isNew),
      };
    });

    // Sort by priority
    enrichedUsers.sort((a, b) => b.priority - a.priority);
    return enrichedUsers.slice(0, count);
  } catch (err) {
    console.error("Error fetching match profiles:", err);
    return [];
  }
};

/**
 * Generate tags for match cards
 */
const generateTags = (user, isNew) => {
  const tags = [];
  if (isNew) tags.push("Nuevo");
  if (user.intent === "dating") tags.push("Busca relación");
  if (user.intent === "casual") tags.push("Algo casual");
  if (user.isVerifiedCreator) tags.push("Verificado");
  return tags;
};

/**
 * Intelligent mixing algorithm
 * Ensures good distribution while maintaining priority
 */
const intelligentMix = (liveStreams, matchProfiles, targetSize) => {
  const mixed = [];
  let liveIdx = 0;
  let matchIdx = 0;

  // Interleave content with 60/40 ratio pattern
  // Pattern: L L M L M L L M... (roughly 60/40)
  const pattern = [1, 1, 0, 1, 0, 1, 1, 0, 1, 0]; // 1=live, 0=match (6 live, 4 match per 10 items)

  for (let i = 0; i < targetSize && (liveIdx < liveStreams.length || matchIdx < matchProfiles.length); i++) {
    const shouldAddLive = pattern[i % pattern.length] === 1;

    if (shouldAddLive && liveIdx < liveStreams.length) {
      mixed.push(liveStreams[liveIdx++]);
    } else if (!shouldAddLive && matchIdx < matchProfiles.length) {
      mixed.push(matchProfiles[matchIdx++]);
    } else if (liveIdx < liveStreams.length) {
      // Fallback: add live if no match available
      mixed.push(liveStreams[liveIdx++]);
    } else if (matchIdx < matchProfiles.length) {
      // Fallback: add match if no live available
      mixed.push(matchProfiles[matchIdx++]);
    }
  }

  return mixed;
};

/**
 * GET /api/feed/live-only
 * Returns only live streams (for Live tab)
 */
const getLiveOnlyFeed = async (req, res) => {
  try {
    const { limit = DEFAULT_FEED_SIZE } = req.query;
    const feedSize = Math.min(parseInt(limit, 10) || DEFAULT_FEED_SIZE, MAX_FEED_SIZE);

    const liveStreams = await getLiveStreams(req, feedSize, req.userId);

    res.json({
      ok: true,
      feed: liveStreams,
      count: liveStreams.length,
    });
  } catch (err) {
    console.error("Live feed error:", err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/feed/match-only
 * Returns only match profiles (for Match tab)
 */
const getMatchOnlyFeed = async (req, res) => {
  try {
    const { limit = DEFAULT_FEED_SIZE } = req.query;
    const feedSize = Math.min(parseInt(limit, 10) || DEFAULT_FEED_SIZE, MAX_FEED_SIZE);

    const userLikes = await Like.find({ from: req.userId }).select("to").lean();
    const likedIds = userLikes.map((l) => l.to.toString());

    const matchProfiles = await getMatchProfiles(req, feedSize, req.userId, likedIds);

    res.json({
      ok: true,
      feed: matchProfiles,
      count: matchProfiles.length,
    });
  } catch (err) {
    console.error("Match feed error:", err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/feed/top
 * Returns top content (trending lives + popular users)
 */
const getTopFeed = async (req, res) => {
  try {
    const { limit = DEFAULT_FEED_SIZE } = req.query;
    const feedSize = Math.min(parseInt(limit, 10) || DEFAULT_FEED_SIZE, MAX_FEED_SIZE);

    // Top = Trending lives + popular verified creators
    const liveCount = Math.ceil(feedSize * 0.7); // 70% live
    const matchCount = Math.floor(feedSize * 0.3); // 30% match

    const [topLives, topUsers] = await Promise.all([
      getTopLiveStreams(req, liveCount),
      getTopMatchProfiles(req, matchCount, req.userId),
    ]);

    const feed = [...topLives, ...topUsers];

    res.json({
      ok: true,
      feed,
      count: feed.length,
    });
  } catch (err) {
    console.error("Top feed error:", err);
    res.status(500).json({ message: err.message });
  }
};

const getTopLiveStreams = async (req, count) => {
  try {
    const lives = await Live.find({ isLive: true, endedAt: null })
      .populate("user", `username name ${FEED_PHOTO_FIELDS} role creatorStatus isVerifiedCreator`)
      .select("-streamKey -paidViewers")
      .lean();

    // Apply active live filter FIRST
    const trulyActiveLives = filterActiveLives(lives);

    const activeLives = trulyActiveLives
      .filter((live) => live && live._id && live.user)
      .filter((live) => {
        const userRole = live.user?.role;
        // Exclude all staff roles
        if (STAFF_ROLES.includes(userRole)) return false;
        const approved = (userRole === "creator" || userRole === "subCreator") && live.user?.creatorStatus === "approved";
        return approved && isLiveActuallyActive(live);
      })
      // CRITICAL: Only include streams with active host Socket.io connection
      .filter((live) => hasLiveHost(String(live._id)));

    const liveIds = activeLives.map((l) => l._id);
    const coinsData = await Gift.aggregate([
      { $match: { liveId: { $in: liveIds } } },
      { $group: { _id: "$liveId", totalCoins: { $sum: "$coinCost" } } },
    ]);

    const coinsMap = new Map();
    coinsData.forEach((c) => {
      coinsMap.set(c._id.toString(), c.totalCoins || 0);
    });

    const enrichedLives = activeLives
      .map((live) => {
        const totalCoinsEarned = coinsMap.get(String(live._id)) || 0;
        const viewerCount = live.viewerCount || 0;
        const isTrending = viewerCount >= 10 || totalCoinsEarned >= 500;

        return {
          ...live,
          user: serializeFeedImageFields(req, live.user),
          totalCoinsEarned,
          isTrending,
          type: "live",
          score: viewerCount * 10 + totalCoinsEarned,
        };
      })
      .filter((live) => live.isTrending); // Only trending for top feed

    enrichedLives.sort((a, b) => b.score - a.score);
    return enrichedLives.slice(0, count);
  } catch (err) {
    console.error("Error fetching top lives:", err);
    return [];
  }
};

const getTopMatchProfiles = async (req, count, currentUserId) => {
  try {
    const currentUser = await User.findById(currentUserId).select("gender interestedIn discoveryPreferences").lean();
    const discoveryMatch = buildDiscoveryMatch(currentUser);

    // Top match profiles = verified or popular users
    const users = await User.find({
      $and: [
        {
          _id: { $ne: currentUserId },
          role: "user",
          onboardingComplete: true,
          isBlocked: false,
          isSuspended: false,
          username: { $ne: null },
          ...discoveryMatch,
        },
        FEED_PHOTO_CANDIDATE_MATCH,
      ],
    })
      .select(`username name ${FEED_PHOTO_FIELDS} bio gender birthdate location interests isVerifiedCreator followersCount`)
      .sort({ followersCount: -1, _id: 1 })
      .limit(count * PHOTO_FILTER_FETCH_MULTIPLIER)
      .lean();

    return users
      .map((user) => serializeFeedImageFields(req, user))
      .filter((user) => Array.isArray(user.profilePhotos) && user.profilePhotos.length > 0)
      .slice(0, count)
      .map((user) => ({
        ...user,
        type: "match",
        tags: generateTags(user, false),
      }));
  } catch (err) {
    console.error("Error fetching top users:", err);
    return [];
  }
};

const getFeedExclusionReasons = (user, context) => {
  const reasons = [];
  const userId = String(user._id);

  if (user.role !== "user") reasons.push(`role:${user.role || "missing"}`);
  if (user.isBlocked === true) reasons.push("blocked");
  if (user.isSuspended === true) reasons.push("suspended");
  if (user.onboardingComplete !== true) reasons.push("onboarding_incomplete");
  if (!hasFeedPhoto(user)) reasons.push("missing_profile_photo");
  if (context.viewerId && userId === context.viewerId) reasons.push("viewer_self");
  if (context.likedProfileIds.has(userId)) reasons.push("liked_by_viewer");
  if (context.clientExcludedProfileIds.has(userId)) reasons.push("client_excluded");
  if (context.returnedProfileIds.has(userId)) reasons.push("returned_by_feed");
  if (!context.returnedProfileIds.has(userId) && reasons.length === 0) {
    reasons.push("passes_filters_but_not_in_returned_top_12");
  }

  return reasons;
};

/**
 * GET /api/admin/feed-diagnostics
 * Admin-only diagnostic view of the same recommendedProfiles path used by /api/feed.
 */
const getFeedDiagnostics = async (req, res) => {
  const startTime = Date.now();
  try {
    const viewerId =
      toObjectIdOrNull(req.query.viewerId) ||
      toObjectIdOrNull(req.query.currentUserId) ||
      toObjectIdOrNull(req.userId);
    const targetId = toObjectIdOrNull(req.query.targetId || req.query.userId);
    const targetEmail = isNonEmptyString(req.query.targetEmail) ? req.query.targetEmail.trim() : "";
    const targetUsername = isNonEmptyString(req.query.targetUsername) ? req.query.targetUsername.trim() : "";
    const diagnosticLimit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || FEED_DIAGNOSTIC_DEFAULT_LIMIT, 1),
      FEED_DIAGNOSTIC_MAX_LIMIT
    );

    const clientExcludedObjectIds = parseExcludedProfileIds(req.query.exclude);
    const clientExcludedProfileIds = new Set(clientExcludedObjectIds.map((id) => id.toString()));
    const excludedProfileIdsById = new Map(clientExcludedObjectIds.map((id) => [id.toString(), id]));
    if (viewerId) excludedProfileIdsById.set(viewerId.toString(), viewerId);

    const likedProfileIdsRaw = viewerId ? await Like.distinct("to", { from: viewerId }) : [];
    likedProfileIdsRaw.forEach((profileId) => {
      const objectId = toObjectIdOrNull(profileId);
      if (objectId) excludedProfileIdsById.set(objectId.toString(), objectId);
    });

    const likedProfileIds = new Set(
      likedProfileIdsRaw.map((profileId) => String(profileId)).filter(Boolean)
    );
    const uniqueExcludedProfileIds = Array.from(excludedProfileIdsById.values());
    const feedMatch = buildRecommendedProfilesMatch(uniqueExcludedProfileIds, {}, viewerId);

    const [totalUserCandidates, totalAfterServerFilters, returnedProfiles, diagnosticUsers, targetByQuery] =
      await Promise.all([
        User.countDocuments({ role: "user" }),
        User.countDocuments(feedMatch),
        User.aggregate(buildRecommendedProfilesPipeline(feedMatch, RECOMMENDED_PROFILE_FETCH_LIMIT_WITH_PHOTO_BUFFER)),
        // Intentionally samples users before feed filters so excluded users can include
        // the actual blocking reason instead of disappearing from diagnostics.
        User.find({ role: "user" })
          .select(FEED_DIAGNOSTIC_USER_FIELDS)
          .sort({ createdAt: -1, _id: -1 })
          .limit(diagnosticLimit)
          .lean(),
        targetId || targetEmail || targetUsername
          ? User.findOne({
              ...(targetId ? { _id: targetId } : {}),
              ...(targetEmail ? { email: targetEmail } : {}),
              ...(targetUsername ? { username: targetUsername } : {}),
            })
              .select(FEED_DIAGNOSTIC_USER_FIELDS)
              .lean()
          : Promise.resolve(null),
      ]);

    const serializedReturnedProfiles = serializeFeedProfilesWithPhotos(req, returnedProfiles, 12);
    const returnedProfileIds = new Set(serializedReturnedProfiles.map((profile) => String(profile._id)));
    const context = {
      viewerId: viewerId ? viewerId.toString() : "",
      likedProfileIds,
      clientExcludedProfileIds,
      returnedProfileIds,
    };
    const diagnosticUsersById = new Map(diagnosticUsers.map((user) => [String(user._id), user]));
    if (targetByQuery) diagnosticUsersById.set(String(targetByQuery._id), targetByQuery);

    const excludedUsers = Array.from(diagnosticUsersById.values())
      .filter((user) => !returnedProfileIds.has(String(user._id)))
      .map((user) => ({
        id: String(user._id),
        reasons: getFeedExclusionReasons(user, context),
      }));

    const targetDiagnostics = targetByQuery
      ? {
          ...getFeedDiagnosticUserSummary(targetByQuery),
          reasons: getFeedExclusionReasons(targetByQuery, context),
          returnedByFeed: returnedProfileIds.has(String(targetByQuery._id)),
        }
      : null;

    res.json({
      ok: true,
      counts: {
        totalUserCandidates,
        totalAfterServerFilters,
        returnedByFeed: returnedProfileIds.size,
        likedByViewerExcluded: likedProfileIds.size,
        clientExcluded: clientExcludedProfileIds.size,
      },
      returnedProfileIds: Array.from(returnedProfileIds),
      profilePhotoDiagnostics: serializedReturnedProfiles.map(getFeedPhotoDiagnostic),
      target: targetDiagnostics,
      excludedUsers,
      excludedUsersLimit: diagnosticLimit,
      appliedFilters: {
        role: "user",
        onboardingComplete: true,
        isBlocked: false,
        isSuspended: false,
        photoRequired: true,
        excludeViewerSelf: Boolean(viewerId),
        excludeLikedByViewer: Boolean(viewerId),
        excludeClientProvidedIds: clientExcludedProfileIds.size > 0,
        genderPreferences: "not_applied",
        inactiveUsers: "not_applied",
        dislikedUsers: "not_persisted_server_side",
      },
      frontendCacheKeys: {
        sessionStorageFeed: "meetyoulive:feed:v1",
        sessionStorageCurrentProfile: "meetyoulive:feed:currentProfileId:v1",
        localStorageSeenProfiles: "meetyoulive:feed:seenProfileIds:v1",
      },
      responseTimeMs: Date.now() - startTime,
    });
  } catch (err) {
    console.error("[Feed Diagnostics] Error:", err.message);
    res.status(500).json({ message: "Error al diagnosticar feed" });
  }
};

/**
 * POST /api/feed/track-visit
 * Track when a user views another user's profile (for hook system)
 */
const trackProfileVisit = async (req, res) => {
  try {
    const { userId: visitedUserId } = req.body;
    const visitorId = req.userId;

    if (!visitedUserId) {
      return res.status(400).json({ message: "userId es requerido" });
    }

    if (String(visitedUserId) === String(visitorId)) {
      return res.json({ ok: true, message: "No se registran auto-visitas" });
    }

    // Upsert visit record
    await UserVisit.findOneAndUpdate(
      { visitor: visitorId, visited: visitedUserId },
      {
        $inc: { visitCount: 1 },
        $set: { lastVisitAt: new Date() },
      },
      { upsert: true, new: true }
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("Track visit error:", err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/feed/visits
 * Get recent profile visits (for hook display)
 */
const getRecentVisits = async (req, res) => {
  try {
    const userId = req.userId;
    const { limit = 10 } = req.query;
    const maxLimit = Math.min(parseInt(limit, 10) || 10, 50);

    const visits = await UserVisit.find({ visited: userId })
      .populate("visitor", "username name avatar")
      .sort({ lastVisitAt: -1 })
      .limit(maxLimit)
      .lean();

    res.json({
      ok: true,
      visits: visits.map((v) => ({
        user: v.visitor,
        visitCount: v.visitCount,
        lastVisitAt: v.lastVisitAt,
      })),
    });
  } catch (err) {
    console.error("Get visits error:", err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * POST /api/feed/send-greeting
 * Send a greeting to another user (hook system, optional coin cost)
 */
const sendGreeting = async (req, res) => {
  try {
    const { userId: toUserId, message = "👋" } = req.body;
    const fromUserId = req.userId;

    if (!toUserId) {
      return res.status(400).json({ message: "userId es requerido" });
    }

    if (String(toUserId) === String(fromUserId)) {
      return res.status(400).json({ message: "No puedes enviarte un saludo a ti mismo" });
    }

    // Create greeting
    const greeting = await Greeting.create({
      from: fromUserId,
      to: toUserId,
      message: message || "👋",
    });

    res.json({ ok: true, greeting });
  } catch (err) {
    console.error("Send greeting error:", err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/feed/greetings
 * Get received greetings (for hook display)
 */
const getReceivedGreetings = async (req, res) => {
  try {
    const userId = req.userId;
    const { limit = 10 } = req.query;
    const maxLimit = Math.min(parseInt(limit, 10) || 10, 50);

    const greetings = await Greeting.find({ to: userId, viewed: false })
      .populate("from", "username name avatar")
      .sort({ createdAt: -1 })
      .limit(maxLimit)
      .lean();

    res.json({
      ok: true,
      greetings: greetings.map((g) => ({
        user: g.from,
        message: g.message,
        createdAt: g.createdAt,
      })),
      count: greetings.length,
    });
  } catch (err) {
    console.error("Get greetings error:", err);
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getFeed,
  getHybridFeed,
  getLiveOnlyFeed,
  getMatchOnlyFeed,
  getTopFeed,
  getFeedDiagnostics,
  trackProfileVisit,
  getRecentVisits,
  sendGreeting,
  getReceivedGreetings,
};
