const User = require("../models/User.js");
const {
  getPrimaryPhotoUrl,
  normalizePhotoUrl,
  syncCanonicalPhotoFields,
  withSerializedUserPhotoFields,
} = require("../lib/photoFields.js");
const {
  canAppearInFeed,
  getMissingProfileFields,
  getProfileCompletionStatus,
} = require("../lib/profileCompletion.js");

const MAX_IMAGES = 6;
const MAX_INTERESTS = 10;
const MIN_INTERESTS = 3;
const ALLOWED_GENDERS = new Set(["male", "female", "other", "prefer_not_to_say"]);
const ALLOWED_INTERESTED_IN = new Set(["male", "female", "both"]);
const ALLOWED_INTENTS = new Set(["dating", "casual", "live", "creator"]);

const normalizeText = (value, maxLength = 160) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const isValidLatitude = (value) => Number.isFinite(value) && value >= -90 && value <= 90;
const isValidLongitude = (value) => Number.isFinite(value) && value >= -180 && value <= 180;

const normalizeGender = (value) => {
  const normalized = normalizeText(value, 40);
  const aliases = { man: "male", woman: "female", nonbinary: "other" };
  return aliases[normalized] || normalized;
};

const normalizeInterestedIn = (value) => {
  const normalized = normalizeText(value, 40);
  const aliases = { men: "male", women: "female" };
  return aliases[normalized] || normalized || "both";
};

const parseBirthdate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const parseDateOrNow = (value) => {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const normalizeCoordinates = (location = {}) => {
  const coordinates = location.coordinates;
  const [arrayLng, arrayLat] = Array.isArray(coordinates) ? coordinates : [];
  const lat = Number(arrayLat ?? coordinates?.lat ?? coordinates?.latitude ?? location.lat ?? location.latitude);
  const lng = Number(arrayLng ?? coordinates?.lng ?? coordinates?.longitude ?? location.lng ?? location.longitude);
  if (!isValidLatitude(lat) || !isValidLongitude(lng)) return undefined;
  return [lng, lat];
};

const normalizeLocation = (input = {}, locationLabelInput = "") => {
  const location = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const country = normalizeText(location.country, 80);
  const city = normalizeText(location.city, 80);
  const region = normalizeText(location.region, 80);
  const label =
    normalizeText(location.label || locationLabelInput, 160) || [city, region, country].filter(Boolean).join(", ");
  const coordinates = normalizeCoordinates(location);
  return {
    type: "Point",
    coordinates,
    country,
    city,
    region,
    label,
  };
};

const getPhotoInputUrl = (value) => {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return value.url || value.secure_url || value.src || value.path || "";
};

const normalizeImages = (req, body, currentUser = {}) => {
  const sources = [];
  if (Array.isArray(body.images)) sources.push(...body.images);
  if (Array.isArray(body.profilePhotos)) sources.push(...body.profilePhotos);
  if (Array.isArray(body.photos)) sources.push(...body.photos);
  sources.push(body.photoUrl, body.avatar, body.profileImage, body.photo);

  if (sources.every((source) => source === undefined)) {
    if (Array.isArray(currentUser.images) && currentUser.images.length > 0) return currentUser.images;
    if (Array.isArray(currentUser.profilePhotos)) sources.push(...currentUser.profilePhotos);
    sources.push(currentUser.avatar);
  }

  const images = [];
  const seen = new Set();
  for (const source of sources) {
    const url = normalizePhotoUrl(req, getPhotoInputUrl(source));
    if (!url || seen.has(url)) continue;
    seen.add(url);
    images.push({
      url,
      publicId: normalizeText(source?.publicId, 160),
      isPrimary: source?.isPrimary === true || images.length === 0,
      source: normalizeText(source?.source, 40),
      uploadedAt: parseDateOrNow(source?.uploadedAt),
    });
    if (images.length >= MAX_IMAGES) break;
  }

  if (images.length > 0 && !images.some((image) => image.isPrimary)) {
    images[0].isPrimary = true;
  }
  if (images.filter((image) => image.isPrimary).length > 1) {
    let primarySeen = false;
    images.forEach((image) => {
      if (image.isPrimary && !primarySeen) {
        primarySeen = true;
        return;
      }
      image.isPrimary = false;
    });
  }

  return images;
};

const getMissingFields = (profile = {}) => {
  const missingFields = [];
  const hasPrimaryImage =
    Array.isArray(profile.images) &&
    profile.images.some((image) => image?.isPrimary === true && normalizeText(image.url).length > 0);
  if (!hasPrimaryImage) missingFields.push("images");
  if (!parseBirthdate(profile.birthdate)) missingFields.push("birthdate");
  if (!ALLOWED_GENDERS.has(profile.gender)) missingFields.push("gender");
  if (!ALLOWED_INTERESTED_IN.has(profile.interestedIn)) missingFields.push("interestedIn");
  const [lng, lat] = Array.isArray(profile.location?.coordinates) ? profile.location.coordinates : [];
  if (!isValidLongitude(lng) || !isValidLatitude(lat)) {
    missingFields.push("location");
  }
  if (!Array.isArray(profile.interests) || profile.interests.length < MIN_INTERESTS) missingFields.push("interests");
  if (!ALLOWED_INTENTS.has(profile.intent)) missingFields.push("intent");
  return missingFields;
};

/**
 * Build the temporary profileStatus payload used to verify photo/profile alignment.
 */
const buildProfileStatusPayload = (req, user, profileCompletion) => ({
  imagesCount: Array.isArray(user.images) ? user.images.filter((image) => normalizePhotoUrl(req, image)).length : 0,
  hasPrimaryPhoto: Boolean(getPrimaryPhotoUrl(user, req)),
  onboardingComplete: profileCompletion.canAppearInFeed,
  canAppearInFeed: profileCompletion.canAppearInFeed,
  missingFields: profileCompletion.missingFields,
});

const updateOnboarding = async (req, res) => {
  try {
    const currentUser = await User.findById(req.userId).select("-password");
    if (!currentUser) return res.status(404).json({ message: "Usuario no encontrado" });

    const gender = normalizeGender(req.body.gender ?? currentUser.gender);
    const interestedIn = normalizeInterestedIn(req.body.interestedIn ?? req.body.genderPreference ?? currentUser.interestedIn);
    const birthdate = parseBirthdate(req.body.birthdate ?? currentUser.birthdate);
    const location = normalizeLocation(req.body.location ?? currentUser.location, req.body.locationLabel ?? currentUser.locationLabel);
    const interests = Array.isArray(req.body.interests)
      ? req.body.interests.map((interest) => normalizeText(interest, 40)).filter(Boolean).slice(0, MAX_INTERESTS)
      : currentUser.interests || [];
    const intent = normalizeText(req.body.intent ?? currentUser.intent, 40);
    const name = normalizeText(req.body.name ?? currentUser.name, 80);
    const images = normalizeImages(req, req.body, currentUser);
    const primaryImage = images.find((image) => image.isPrimary) || images[0] || null;

    const mergedProfile = {
      ...currentUser.toObject(),
      name,
      images,
      avatar: primaryImage?.url || currentUser.avatar || "",
      profilePhotos: images.map((image) => image.url),
      birthdate,
      gender,
      interestedIn,
      location,
      interests,
      intent,
    };
    const syncedPhotoFields = syncCanonicalPhotoFields(mergedProfile, req);
    const missingFields = getMissingProfileFields(mergedProfile, { req });
    const canAppearInFeedValue = canAppearInFeed(mergedProfile, { req, missingFields });
    const onboardingComplete = canAppearInFeedValue;

    const updates = {
      images: syncedPhotoFields.images,
      avatar: syncedPhotoFields.avatar,
      profilePhotos: syncedPhotoFields.profilePhotos,
      birthdate,
      gender: ALLOWED_GENDERS.has(gender) ? gender : currentUser.gender,
      interestedIn: ALLOWED_INTERESTED_IN.has(interestedIn) ? interestedIn : currentUser.interestedIn || "both",
      location,
      locationPoint: location.coordinates ? { type: "Point", coordinates: location.coordinates } : null,
      locationLabel: location.label,
      interests,
      intent: ALLOWED_INTENTS.has(intent) ? intent : currentUser.intent || "",
      onboardingComplete,
    };

    if (name) updates.name = name;
    if (req.body.bio !== undefined) updates.bio = normalizeText(req.body.bio, 500);
    if (req.body.maxDistanceKm !== undefined) {
      const maxDistanceKm = Number(req.body.maxDistanceKm);
      if (Number.isFinite(maxDistanceKm) && maxDistanceKm > 0) updates.maxDistanceKm = Math.floor(maxDistanceKm);
    }
    if (["nearby", "country", "global"].includes(req.body.discoveryScope)) {
      updates.discoveryScope = req.body.discoveryScope;
    }
    if (req.body.discoveryPreferences && typeof req.body.discoveryPreferences === "object") {
      const incomingPreferences = req.body.discoveryPreferences;
      const sanitizedPreferences = {};
      const maxDistanceKm = Number(incomingPreferences.maxDistanceKm);
      if (Number.isFinite(maxDistanceKm) && maxDistanceKm > 0) {
        sanitizedPreferences.maxDistanceKm = Math.floor(maxDistanceKm);
      }
      if (["nearby", "country", "global"].includes(incomingPreferences.discoveryScope)) {
        sanitizedPreferences.discoveryScope = incomingPreferences.discoveryScope;
      }
      updates.discoveryPreferences = {
        ...(currentUser.discoveryPreferences?.toObject?.() || currentUser.discoveryPreferences || {}),
        ...sanitizedPreferences,
      };
    }

    currentUser.set(updates);
    const user = await currentUser.save();
    syncCanonicalPhotoFields(user, req);
    const payload = withSerializedUserPhotoFields(req, user);
    const profileCompletion = getProfileCompletionStatus(payload, { req });
    const finalOnboardingComplete = profileCompletion.canAppearInFeed;
    payload.missingFields = profileCompletion.missingFields;
    payload.onboardingComplete = finalOnboardingComplete;
    payload.canAppearInFeed = profileCompletion.canAppearInFeed;
    payload.profileCompletion = { ...profileCompletion, onboardingComplete: finalOnboardingComplete };
    payload.profileCompletionStatus = payload.profileCompletion;
    payload.profileStatus = buildProfileStatusPayload(req, payload, payload.profileCompletion);

    return res.json({
      ok: true,
      user: payload,
      missingFields: payload.missingFields,
      onboardingComplete: finalOnboardingComplete,
      canAppearInFeed: profileCompletion.canAppearInFeed,
      profileCompletion: payload.profileCompletion,
      profileCompletionStatus: payload.profileCompletionStatus,
      profileStatus: payload.profileStatus,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

module.exports = { updateOnboarding, normalizeImages };
