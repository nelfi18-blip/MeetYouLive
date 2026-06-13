const DISCOVERY_GOAL_INTENT_MAP = {
  serious_relationship: ["dating"],
  friendship: ["casual"],
  dating: ["dating", "casual"],
  networking: ["creator", "live"],
};

const DISCOVERY_GENDER_MATCH = {
  women: ["woman"],
  men: ["man"],
  both: ["woman", "man"],
};

const isUnsetInterestedIn = (interestedIn) =>
  interestedIn === null || interestedIn === undefined || interestedIn === "";
const normalizeInterestedIn = (interestedIn) =>
  isUnsetInterestedIn(interestedIn) || !DISCOVERY_GENDER_MATCH[interestedIn] ? "both" : interestedIn;

const normalizeDiscoveryCompatibility = (viewer = null) => {
  if (!viewer) return null;
  return {
    ...viewer,
    gender: viewer.gender || null,
    interestedIn: normalizeInterestedIn(viewer.interestedIn),
  };
};

  const EARTH_RADIUS_KM = 6371;

  const normalizeLocationText = (value) =>
    typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLowerCase() : "";

  const getLocationLabel = (location, fallback = "") => {
    if (typeof location === "string") return location.trim();
    if (!location || typeof location !== "object") return normalizeLocationText(fallback) ? fallback.trim() : "";
    const parts = [location.city, location.region, location.country]
      .map((part) => (typeof part === "string" ? part.trim() : ""))
      .filter(Boolean);
    return parts.join(", ") || (typeof fallback === "string" ? fallback.trim() : "");
  };

  const getLocationCoordinates = (user = {}) => {
    const coordinates = user?.location?.coordinates;
    const lat = Number(coordinates?.lat);
    const lng = Number(coordinates?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  };

  const calculateDistanceKm = (from, to) => {
    if (!from || !to) return null;
    const toRadians = (degrees) => (degrees * Math.PI) / 180;
    const dLat = toRadians(to.lat - from.lat);
    const dLng = toRadians(to.lng - from.lng);
    const lat1 = toRadians(from.lat);
    const lat2 = toRadians(to.lat);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const getDiscoveryScope = (viewer = {}) =>
    viewer.discoveryScope || viewer.discoveryPreferences?.discoveryScope || "global";

  const getMaxDistanceKm = (viewer = {}) => {
    const value = viewer.maxDistanceKm ?? viewer.discoveryPreferences?.maxDistanceKm;
    const distance = Number(value);
    return Number.isFinite(distance) && distance > 0 ? distance : null;
  };

  const buildLocationTextMatch = (viewer = {}) => {
    const country = normalizeLocationText(viewer.location?.country);
    const city = normalizeLocationText(viewer.location?.city);
    const legacyLabel = normalizeLocationText(getLocationLabel(viewer.location, viewer.locationLabel));
    if (country) {
      const clauses = [{ "location.country": new RegExp(`^${country.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }];
      if (city) {
        clauses.push({ "location.city": new RegExp(`^${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
      }
      return city ? { $and: clauses } : clauses[0];
    }
    if (legacyLabel) {
      return { locationLabel: new RegExp(legacyLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") };
    }
    return null;
  };

  const buildDiscoveryLocationMatch = (viewer = {}) => {
    const scope = getDiscoveryScope(viewer);
    if (scope === "country") return buildLocationTextMatch(viewer);
    return null;
  };

  const applyDiscoveryLocationFilter = (viewer = {}, candidates = []) => {
    const scope = getDiscoveryScope(viewer);
    if (scope === "global") return candidates;
    if (scope === "nearby") {
      const origin = getLocationCoordinates(viewer);
      const maxDistanceKm = getMaxDistanceKm(viewer);
      if (!origin || !maxDistanceKm) return candidates;
      return candidates
        .map((candidate) => {
          const distanceKm = calculateDistanceKm(origin, getLocationCoordinates(candidate));
          if (distanceKm === null || distanceKm > maxDistanceKm) return null;
          return { ...candidate, distanceKm: Math.round(distanceKm * 10) / 10 };
        })
        .filter(Boolean);
    }
    return candidates;
  };

const getDiscoveryCompatibilityUpdates = (user = {}) => {
  const updates = {};
  if (user.gender === undefined || user.gender === "") updates.gender = null;
  if (isUnsetInterestedIn(user.interestedIn)) updates.interestedIn = "both";
  return updates;
};

const buildDiscoveryMatch = (viewer = null) => {
  viewer = normalizeDiscoveryCompatibility(viewer);
  if (!viewer) return {};
  const match = {};

  if (DISCOVERY_GENDER_MATCH[viewer.interestedIn]) {
    match.gender = { $in: DISCOVERY_GENDER_MATCH[viewer.interestedIn] };
  }

  if (viewer.gender === "man" || viewer.gender === "woman") {
    const reciprocalInterestedIn =
      viewer.gender === "man" ? ["", null, "men", "both"] : ["", null, "women", "both"];
    match.interestedIn = { $in: reciprocalInterestedIn };
  }

  const ageRange = viewer.discoveryPreferences?.ageRange || {};
  const minAge = Number.isFinite(ageRange.min) ? ageRange.min : null;
  const maxAge = Number.isFinite(ageRange.max) ? ageRange.max : null;
  if (minAge !== null || maxAge !== null) {
    const birthdateFilter = {};
    if (minAge !== null) {
      const maxBirthdate = new Date();
      maxBirthdate.setFullYear(maxBirthdate.getFullYear() - minAge);
      birthdateFilter.$lte = maxBirthdate;
    }
    if (maxAge !== null) {
      const minBirthdate = new Date();
      minBirthdate.setFullYear(minBirthdate.getFullYear() - maxAge);
      birthdateFilter.$gte = minBirthdate;
    }
    match.birthdate = birthdateFilter;
  }

  if (Array.isArray(viewer.discoveryPreferences?.languages) && viewer.discoveryPreferences.languages.length > 0) {
    match.preferredLanguage = { $in: viewer.discoveryPreferences.languages };
  }

  if (Array.isArray(viewer.discoveryPreferences?.goals) && viewer.discoveryPreferences.goals.length > 0) {
    const matchedIntents = new Set();
    viewer.discoveryPreferences.goals.forEach((goal) => {
      (DISCOVERY_GOAL_INTENT_MAP[goal] || []).forEach((intent) => matchedIntents.add(intent));
    });
    if (matchedIntents.size > 0) {
      match.intent = { $in: Array.from(matchedIntents) };
    }
  }

  return match;
};

module.exports = {
  DISCOVERY_GOAL_INTENT_MAP,
  DISCOVERY_GENDER_MATCH,
  normalizeDiscoveryCompatibility,
  getDiscoveryCompatibilityUpdates,
  getLocationLabel,
  getLocationCoordinates,
  calculateDistanceKm,
  getDiscoveryScope,
  getMaxDistanceKm,
  buildDiscoveryLocationMatch,
  applyDiscoveryLocationFilter,
  buildDiscoveryMatch,
};
