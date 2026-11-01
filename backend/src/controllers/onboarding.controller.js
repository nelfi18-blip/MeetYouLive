const User = require("../models/User.js");
const {
  getPrimaryPhotoUrl,
  normalizePhotoUrl,
  syncCanonicalPhotoFields,
  withSerializedUserPhotoFields,
} = require("../lib/photoFields.js");
const {
  rejectNewPhotosWithoutFace,
  sendFacePhotoValidationErrorIfApplicable,
} = require("../lib/facePhotoValidationGate.js");
const {
  preparePhotoVerificationReset,
  reconcilePhotoVerificationAfterChange,
} = require("../lib/photoVerificationInvalidation.js");
const {
  canAppearInFeed,
  getMissingProfileFields,
  getProfileCompletionStatus,
} = require("../lib/profileCompletion.js");
const { isInterestedInConfirmed } = require("../lib/discovery.js");
const { normalizeLocationForUserUpdate } = require("../lib/location.js");
const { calculateAge } = require("../lib/age.js");
const { trackSafeAnalyticsEvent } = require("../services/analytics.service.js");
const trackMilestoneEvent = typeof trackSafeAnalyticsEvent === "function" ? trackSafeAnalyticsEvent : () => {};

const MAX_IMAGES = 6;
const MAX_INTERESTS = 10;
const MIN_INTERESTS = 3;
const MIN_AGE_YEARS = 18;
const ALLOWED_GENDERS = new Set(["male", "female", "other", "prefer_not_to_say"]);
const ALLOWED_INTERESTED_IN = new Set(["male", "female", "both"]);
const ALLOWED_INTENTS = new Set(["dating", "casual", "live", "creator"]);

const normalizeText = (value, maxLength = 160) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const normalizeGender = (value) => {
  const normalized = normalizeText(value, 40);
  const aliases = { man: "male", woman: "female", nonbinary: "other" };
  return aliases[normalized] || normalized;
};

const normalizeInterestedIn = (value) => {
  const normalized = normalizeText(value, 40);
  const aliases = { men: "male", women: "female" };
  return aliases[normalized] || normalized;
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
    // Only an explicitly-provided, valid selection counts as a confirmed
    // choice. Missing/empty input never falls back to "both" here — that
    // silent fallback is exactly what let Discovery assume an unconfirmed
    // "both" preference for users who never picked one.
    const rawInterestedIn = req.body.interestedIn ?? req.body.genderPreference;
    const interestedInProvided = rawInterestedIn !== undefined && rawInterestedIn !== null && rawInterestedIn !== "";
    const normalizedProvidedInterestedIn = interestedInProvided ? normalizeInterestedIn(rawInterestedIn) : "";
    const interestedInProvidedIsValid = ALLOWED_INTERESTED_IN.has(normalizedProvidedInterestedIn);
    const alreadyConfirmedInterestedIn = isInterestedInConfirmed(currentUser);
    const interestedInConfirmed = alreadyConfirmedInterestedIn || interestedInProvidedIsValid;
    const interestedIn = interestedInProvidedIsValid
      ? normalizedProvidedInterestedIn
      : currentUser.interestedIn || "both";
    const birthdate = parseBirthdate(req.body.birthdate ?? currentUser.birthdate);
    if (!birthdate || calculateAge(birthdate, new Date()) < MIN_AGE_YEARS) {
      return res.status(400).json({ message: "Debes tener al menos 18 años para usar MeetYouLive" });
    }
    const parsedLocation = normalizeLocationForUserUpdate(
      req.body.location ?? currentUser.location,
      req.body.locationLabel ?? currentUser.locationLabel
    );
    const location = parsedLocation.location;
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
      // `syncCanonicalPhotoFields` treats `primaryPhoto` as the HIGHEST
      // priority candidate (see `getRawCanonicalPhotoCandidates` in
      // photoFields.js) — leaving it as the stale value copied from
      // `currentUser.toObject()` would make it always win over a genuinely
      // new `images`/`avatar`, silently ignoring any new photo submitted
      // through onboarding once the user already has one on file.
      primaryPhoto: primaryImage?.url || currentUser.primaryPhoto || currentUser.avatar || "",
      profilePhotos: images.map((image) => image.url),
      birthdate,
      gender,
      interestedIn,
      interestedInConfirmed,
      location,
      interests,
      intent,
    };
    const syncedPhotoFields = syncCanonicalPhotoFields(mergedProfile, req);
    // Anti-evasion face-presence gate: PUT /api/onboarding is a separate
    // code path from PATCH /me/onboarding that the onboarding frontend
    // actually calls — it must run the exact same gate so a new/changed
    // photo cannot reach the profile without first passing face validation,
    // while resubmitting only pre-existing photos (reorder, no change) is
    // never blocked. No-ops entirely while the flag is off.
    await rejectNewPhotosWithoutFace(req, currentUser, syncedPhotoFields);
    const missingFields = getMissingProfileFields(mergedProfile, { req });
    // Onboarding cannot complete without an explicit, confirmed selection —
    // this is enforced here (not in the shared profileCompletion checks) so
    // that already-complete existing accounts are never retroactively marked
    // incomplete; see getMissingProfileFields' "interestedIn" docs.
    if (!interestedInConfirmed && !missingFields.includes("interestedIn")) {
      missingFields.push("interestedIn");
    }
    const profileComplete = missingFields.length === 0;
    const canAppearInFeedValue = canAppearInFeed(mergedProfile, { req, missingFields });
    const onboardingComplete = profileComplete;

    const updates = {
      images: syncedPhotoFields.images,
      avatar: syncedPhotoFields.avatar,
      // Keep the canonical `primaryPhoto` schema field in sync with
      // `avatar`/`images[0]` — required for photoVerification invalidation
      // (below) to correctly detect a real primary-photo change and for any
      // later CompareFaces reconciliation to match against the photo that
      // was actually persisted.
      primaryPhoto: syncedPhotoFields.primaryPhoto,
      profilePhotos: syncedPhotoFields.profilePhotos,
      birthdate,
      gender: ALLOWED_GENDERS.has(gender) ? gender : currentUser.gender,
      interestedIn: ALLOWED_INTERESTED_IN.has(interestedIn) ? interestedIn : currentUser.interestedIn || "both",
      interestedInConfirmed,
      location,
      locationPoint: parsedLocation.locationPoint,
      locationLabel: parsedLocation.locationLabel,
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

    // Phase 1: merge the photoVerification reset (+ transition token) into
    // this SAME atomic write when the primary photo is changing — never a
    // separate, later write (see photoVerificationInvalidation.js).
    const { resetFields, changeToken } = preparePhotoVerificationReset(currentUser, syncedPhotoFields.primaryPhoto);
    if (resetFields) Object.assign(updates, resetFields);

    currentUser.set(updates);
    const user = await currentUser.save();
    // Phase 2: AWS-backed comparison + conditional restore-to-verified
    // write, gated on BOTH the photo and the exact token written above.
    const photoVerification = await reconcilePhotoVerificationAfterChange({
      userId: req.userId,
      currentUser,
      nextPrimaryPhoto: syncedPhotoFields.primaryPhoto,
      changeToken,
      ip: req.ip,
    });
    if (photoVerification) user.photoVerification = photoVerification;
    syncCanonicalPhotoFields(user, req);
    const payload = withSerializedUserPhotoFields(req, user);
    const profileCompletion = getProfileCompletionStatus(payload, { req });
    const persistedMissingFields =
      interestedInConfirmed || profileCompletion.missingFields.includes("interestedIn")
        ? profileCompletion.missingFields
        : [...profileCompletion.missingFields, "interestedIn"];
    const finalOnboardingComplete = persistedMissingFields.length === 0;
    payload.missingFields = persistedMissingFields;
    payload.onboardingComplete = finalOnboardingComplete;
    payload.canAppearInFeed = finalOnboardingComplete && profileCompletion.canAppearInFeed;
    payload.profileCompletion = {
      ...profileCompletion,
      missingFields: persistedMissingFields,
      missing: persistedMissingFields,
      complete: finalOnboardingComplete,
      profileComplete: finalOnboardingComplete,
      canAppearInFeed: payload.canAppearInFeed,
      onboardingComplete: finalOnboardingComplete,
    };
    payload.profileCompletionStatus = payload.profileCompletion;
    payload.profileStatus = buildProfileStatusPayload(req, payload, payload.profileCompletion);
    if (finalOnboardingComplete) {
      trackMilestoneEvent("onboarding_completed", String(req.userId));
      trackMilestoneEvent("profile_completed", String(req.userId));
    }

    return res.json({
      ok: true,
      user: payload,
      missingFields: payload.missingFields,
      onboardingComplete: finalOnboardingComplete,
      canAppearInFeed: payload.canAppearInFeed,
      profileCompletion: payload.profileCompletion,
      profileCompletionStatus: payload.profileCompletionStatus,
      profileStatus: payload.profileStatus,
    });
  } catch (err) {
    if (sendFacePhotoValidationErrorIfApplicable(res, err)) return undefined;
    return res.status(500).json({ message: err.message });
  }
};

module.exports = { updateOnboarding, normalizeImages };
