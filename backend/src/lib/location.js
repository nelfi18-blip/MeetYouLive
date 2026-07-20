"use strict";

const normalizeLocationText = (value, maxLength = 160) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const isValidLatitude = (value) => Number.isFinite(value) && value >= -90 && value <= 90;
const isValidLongitude = (value) => Number.isFinite(value) && value >= -180 && value <= 180;

const normalizeLocationCoordinates = (location = {}) => {
  const coordinates = location.coordinates;
  const [arrayLng, arrayLat] = Array.isArray(coordinates) ? coordinates : [];
  const lat = Number(arrayLat ?? coordinates?.lat ?? coordinates?.latitude ?? location.lat ?? location.latitude);
  const lng = Number(arrayLng ?? coordinates?.lng ?? coordinates?.longitude ?? location.lng ?? location.longitude);
  if (!isValidLatitude(lat) || !isValidLongitude(lng)) return undefined;
  return [lng, lat];
};

const parseLegacyLocationString = (value = "") => {
  const label = normalizeLocationText(value);
  const parts = label
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return { city: "", region: "", country: "", label: "" };
  if (parts.length === 1) return { city: "", region: "", country: parts[0], label };
  return {
    city: parts[0],
    region: parts.length > 2 ? parts.slice(1, -1).join(", ") : "",
    country: parts[parts.length - 1],
    label,
  };
};

const normalizeUserLocationValue = (value, fallbackLabel = "") => {
  if (typeof value === "string") {
    const parsed = parseLegacyLocationString(value);
    return {
      type: "Point",
      country: parsed.country,
      city: parsed.city,
      region: parsed.region,
      label: parsed.label,
    };
  }

  const location = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const country = normalizeLocationText(location.country, 80);
  const city = normalizeLocationText(location.city, 80);
  // API responses and new clients should use `region`; `state` is accepted only
  // as legacy input and is persisted into the canonical `region` field.
  const region = normalizeLocationText(location.region ?? location.state, 80);
  const label =
    normalizeLocationText(location.label || fallbackLabel) || [city, region, country].filter(Boolean).join(", ");
  const coordinates = normalizeLocationCoordinates(location);
  return {
    type: "Point",
    ...(coordinates ? { coordinates } : {}),
    country,
    city,
    region,
    label,
  };
};

const normalizeLocationForUserUpdate = (locationInput, locationLabelInput = "") => {
  const location = normalizeUserLocationValue(locationInput, locationLabelInput);
  return {
    location,
    locationLabel: location.label || normalizeLocationText(locationLabelInput),
    locationPoint: location.coordinates ? { type: "Point", coordinates: location.coordinates } : null,
  };
};

module.exports = {
  isValidLatitude,
  isValidLongitude,
  normalizeLocationCoordinates,
  normalizeLocationForUserUpdate,
  normalizeLocationText,
  normalizeUserLocationValue,
  parseLegacyLocationString,
};
