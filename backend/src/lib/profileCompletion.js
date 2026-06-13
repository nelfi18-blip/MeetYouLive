const { getLocationLabel } = require("./discovery.js");
const { hasSerializableUserPhoto } = require("./photoFields.js");

const PROFILE_PHOTO_VALIDATION_REQUEST = { protocol: "https", get: () => "" };
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
const ALLOWED_INTERESTED_IN = new Set(["women", "men", "both"]);
const ALLOWED_DISCOVERY_SCOPES = new Set(["nearby", "country", "global"]);

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

const normalizeInterestedIn = (value) =>
  isNonEmptyString(value) && ALLOWED_INTERESTED_IN.has(value) ? value : "both";

const normalizeDiscoveryScope = (user = {}) => {
  const value = user.discoveryScope || user.discoveryPreferences?.discoveryScope;
  return ALLOWED_DISCOVERY_SCOPES.has(value) ? value : "global";
};

const calculateAge = (birthdate) => {
  if (!birthdate) return null;
  const date = birthdate instanceof Date ? birthdate : new Date(birthdate);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDelta = now.getMonth() - date.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < date.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
};

const getProfileCompletionChecks = (user = {}, req = PROFILE_PHOTO_VALIDATION_REQUEST) => {
  const normalizedInterestedIn = normalizeInterestedIn(user.interestedIn);
  const checks = {
    name: isNonEmptyString(user.name),
    photo: hasSerializableUserPhoto(req, user),
    birthdate: calculateAge(user.birthdate) !== null,
    location: getLocationLabel(user.location, user.locationLabel).length > 0,
    gender: isNonEmptyString(user.gender),
    interestedIn: Boolean(normalizedInterestedIn),
    intent: isNonEmptyString(user.intent),
    interests: Array.isArray(user.interests) && user.interests.length >= MIN_PROFILE_INTERESTS,
  };
  return checks;
};

const getMissingProfileFields = (user = {}, options = {}) => {
  const checks = getProfileCompletionChecks(user, options.req);
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
  const missingFields = getMissingProfileFields(user, options);
  const completedFields = PROFILE_REQUIRED_FIELDS.length - missingFields.length;
  const complete = missingFields.length === 0;
  const missingPreferenceFields = missingFields.filter((field) => field === "gender" || field === "interestedIn");

  return {
    onboardingComplete: user.onboardingComplete === true,
    complete,
    profileComplete: complete,
    percent: Math.round((completedFields / PROFILE_REQUIRED_FIELDS.length) * 100),
    missing: missingFields,
    missingFields,
    age: calculateAge(user.birthdate),
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
  calculateAge,
  canAppearInFeed,
  getMissingProfileFields,
  getProfileCompatibilityUpdates,
  getProfileCompletionStatus,
  normalizeDiscoveryScope,
  normalizeInterestedIn,
};
