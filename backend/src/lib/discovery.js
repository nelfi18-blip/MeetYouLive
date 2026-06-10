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

const buildDiscoveryMatch = (viewer = null) => {
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
      minBirthdate.setFullYear(minBirthdate.getFullYear() - (maxAge + 1));
      minBirthdate.setDate(minBirthdate.getDate() + 1);
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
  buildDiscoveryMatch,
};
