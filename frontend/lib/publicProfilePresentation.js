/**
 * Consistent, privacy-aware identity metadata for discovery/profile cards.
 * The backend resolves full birthdates to completed years, and GPS must stay
 * private; the UI only renders known ages and coarse user-facing locations.
 */
export function getPublicAge(profile) {
  const age = Number(profile?.age);
  return Number.isInteger(age) && age >= 18 && age <= 120 ? age : null;
}

const cleanText = (value) => typeof value === "string" ? value.trim() : "";

export function getPublicLocationLabel(profile) {
  const value = profile?.location;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const city = cleanText(value.city);
    const country = cleanText(value.country);
    // Prefer coarse city/country over a potentially precise address or
    // freeform label. No map coordinates or home addresses on cards.
    if (city || country) return [city, country].filter(Boolean).join(", ");
  }
  const raw = cleanText(value) || cleanText(profile?.locationLabel);
  if (!raw || /^[-+]?\d+(?:\.\d+)?\s*[,;]\s*[-+]?\d+(?:\.\d+)?$/u.test(raw)) return "";
  // Historical city/region/country labels: omit region on discovery cards.
  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length > 2 ? [parts[0], parts[parts.length - 1]].join(", ") : raw;
}

export function formatPublicNameAge(displayName, age) {
  return getPublicAge({ age }) === null ? displayName : `${displayName}, ${age}`;
}
