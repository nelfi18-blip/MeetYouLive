const { getLocationLabel } = require("./discovery.js");
const { hasSerializableUserPhoto } = require("./photoFields.js");
const { calculateAge } = require("./age.js");

const HTTPS_REQUEST_STUB = { protocol: "https", get: () => "" };
const MIN_PROFILE_INTERESTS = 3;
const PROFILE_REQUIRED_FIELDS = [
  "name",
  "photo",
  "birthdate",
  "location",
  "gender",
  "interestedIn",
  "intent",
  "interests",
];
const PREFERENCE_FIELDS = new Set(["gender", "interestedIn"]);
const ALLOWED_INTERESTED_IN = new Set(["women", "men", "both"]);
const ALLOWED_DISCOVERY_SCOPES = new Set(["nearby", "country", "global"]);

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

const normalizeInterestedIn = (value) =>
  isNonEmptyString(value) && ALLOWED_INTERESTED_IN.has(value) ? value : "both";

const normalizeDiscoveryScope = (user = {}) => {
  const value = user.discoveryScope || user.discoveryPreferences?.discoveryScope;
  return ALLOWED_DISCOVERY_SCOPES.has(value) ? value : "global";
};

const getProfileCompletionChecks = (user = {}, req = HTTPS_REQUEST_STUB, now = new Date()) => {
  const normalizedInterestedIn = normalizeInterestedIn(user.interestedIn);
  const checks = {
    name: isNonEmptyString(user.name),
    photo: hasSerializableUserPhoto(req, user),
    birthdate: calculateAge(user.birthdate, now) !== null,
    location: getLocationLabel(user.location, user.locationLabel).length > 0,
    gender: isNonEmptyString(user.gender),
    interestedIn: Boolean(normalizedInterestedIn),
    intent: isNonEmptyString(user.intent),
    interests: Array.isArray(user.interests) && user.interests.length >= MIN_PROFILE_INTERESTS,
  };
  return checks;
};

const getMissingProfileFields = (user = {}, options = {}) => {
  const checks = getProfileCompletionChecks(user, options.req, options.now || new Date());
  return PROFILE_REQUIRED_FIELDS.filter((field) => !checks[field]);
};

const canAppearInFeed = (user = {}, options = {}) => {
  const missingFields = options.missingFields || getMissingProfileFields(user, options);
  return (
    user.role === "user" &&
    user.isBlocked !== true &&
    user.isSuspended !== true &&
    missingFields.length === 0
  );
};

const getProfileCompatibilityUpdates = (user = {}) => {
  const updates = {};
  const interestedIn = normalizeInterestedIn(user.interestedIn);
  if (user.interestedIn !== interestedIn) updates.interestedIn = interestedIn;
  const discoveryScope = normalizeDiscoveryScope(user);
  if (user.discoveryScope !== discoveryScope) updates.discoveryScope = discoveryScope;
  return updates;
};

const getProfileCompletionStatus = (user = {}, options = {}) => {
  const now = options.now || new Date();
  const missingFields = getMissingProfileFields(user, { ...options, now });
  const completedFields = PROFILE_REQUIRED_FIELDS.length - missingFields.length;
  const complete = missingFields.length === 0;
  const missingPreferenceFields = missingFields.filter((field) => PREFERENCE_FIELDS.has(field));

  return {
    onboardingComplete: user.onboardingComplete === true,
    complete,
    profileComplete: complete,
    percent: Math.round((completedFields / PROFILE_REQUIRED_FIELDS.length) * 100),
    missing: missingFields,
    missingFields,
    age: calculateAge(user.birthdate, now),
    interestedIn: normalizeInterestedIn(user.interestedIn),
    discoveryScope: normalizeDiscoveryScope(user),
    gender: isNonEmptyString(user.gender) ? user.gender : null,
    canAppearInFeed: canAppearInFeed(user, { ...options, missingFields }),
    preferenceCompletionNeeded: missingPreferenceFields.length > 0,
    missingPreferenceFields,
  };
};

module.exports = {
  MIN_PROFILE_INTERESTS,
  PROFILE_REQUIRED_FIELDS,
  canAppearInFeed,
  getMissingProfileFields,
  getProfileCompatibilityUpdates,
  getProfileCompletionStatus,
  normalizeDiscoveryScope,
  normalizeInterestedIn,
};
