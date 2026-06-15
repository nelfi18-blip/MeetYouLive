const { Router } = require("express");
const bcrypt = require("bcryptjs");
const fs = require("fs/promises");
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const rateLimit = require("express-rate-limit");
const { verifyToken, optionalVerifyToken } = require("../middlewares/auth.middleware.js");
const { STAFF_ROLES } = require("../middlewares/admin.middleware.js");
const upload = require("../middlewares/upload.middleware.js");
const User = require("../models/User.js");
const Live = require("../models/Live.js");
const { calculateCompatibility } = require("../services/compatibility.service.js");
const { getOnlineUsers } = require("../lib/socket.js");
const {
  DISCOVERY_GOAL_INTENT_MAP,
  DISCOVERY_GENDER_MATCH,
  applyDiscoveryLocationFilter,
  buildDiscoveryMatch,
  buildDiscoveryLocationMatch,
  combineDiscoveryFilters,
  getDiscoveryCompatibilityUpdates,
  getLocationLabel,
  normalizeDiscoveryCompatibility,
} = require("../lib/discovery.js");
const {
  canAppearInFeed,
  getMissingProfileFields,
  getProfileCompletionStatus,
} = require("../lib/profileCompletion.js");

const router = Router();
const uploadDir = path.normalize(path.resolve(__dirname, "../../uploads"));

const userLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

const uploadErrorPayload = (status, code, message, error = code) => ({
  ok: false,
  status,
  error,
  message,
  code,
});

const sendUploadError = (res, err, fallbackMessage = "Error al subir la imagen") => {
  // TODO(2026-06-14): Remove temporary upload diagnostics after onboarding photo issue is resolved.
  console.error("[avatar-upload] multer error", {
    name: err?.name,
    code: err?.code,
    message: err?.message,
  });
  if (!err) {
    return res.status(500).json(uploadErrorPayload(500, "UPLOAD_FAILED", fallbackMessage, "Upload failed"));
  }

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(413)
        .json(uploadErrorPayload(413, "FILE_TOO_LARGE", "La imagen es demasiado grande. Intenta con una foto más pequeña.", "File too large"));
    }

    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return res
        .status(400)
        .json(uploadErrorPayload(400, "INVALID_FILE_FIELD", 'El campo multipart debe llamarse "avatar".', "Unexpected file field"));
    }

    return res.status(400).json({
      ...uploadErrorPayload(400, "UPLOAD_INVALID_REQUEST", err.message || fallbackMessage, err.code || "Invalid upload request"),
    });
  }

  if (err.code === "UNSUPPORTED_MEDIA_TYPE" || err.status === 415) {
    return res.status(415).json({
      ...uploadErrorPayload(415, "UNSUPPORTED_MEDIA_TYPE", "Formato no permitido. Usa JPG, PNG, WebP o GIF.", "Unsupported media type"),
    });
  }

  if (err.code === "UPLOAD_DIR_UNAVAILABLE" || err.code === "EACCES" || err.code === "ENOENT") {
    return res.status(500).json({
      ...uploadErrorPayload(500, "FILE_SAVE_FAILED", "Error guardando archivo.", err.code || "File save failed"),
    });
  }

  if (typeof err.message === "string" && err.message.includes("Solo se permiten imágenes")) {
    return res.status(415).json({
      ...uploadErrorPayload(415, "UNSUPPORTED_MEDIA_TYPE", "Formato no permitido. Usa JPG, PNG, WebP o GIF.", "Unsupported media type"),
    });
  }

  return res.status(500).json({
    ...uploadErrorPayload(500, "UPLOAD_FAILED", fallbackMessage, err.code || err.message || "Upload failed"),
  });
};

const sendAvatarUploadJsonError = (res, status, code, message, error = code) => {
  return res.status(status).json(uploadErrorPayload(status, code, message, error));
};

// Request structured auth errors for avatar uploads so frontend can display
// status/error/message/code instead of a generic upload failure.
const enableAvatarUploadDiagnostics = (req, _res, next) => {
  req.structuredErrors = true;
  next();
};

const normalizeHttpProtocol = (value) => {
  const protocol = typeof value === "string" ? value.replace(/:$/, "").toLowerCase() : "";
  return protocol === "http" || protocol === "https" ? protocol : "https";
};

const isIpAddress = (hostname) =>
  /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(":");

const getRequestOrigin = (req) => {
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = normalizeHttpProtocol(forwardedProto || req.protocol);
  const host = req.get("x-forwarded-host")?.split(",")[0]?.trim() || req.get("host");
  if (!host || /[/\\?#@]/.test(host)) return "";
  let parsedHost;
  try {
    parsedHost = new URL(`${protocol}://${host}`);
  } catch {
    return "";
  }
  const hostname = parsedHost.hostname || "";
  const port = parsedHost.port ? Number(parsedHost.port) : null;
  const validHostname =
    hostname === "localhost" ||
    (hostname.includes(".") &&
      !hostname.includes("--") &&
      !isIpAddress(hostname) &&
      hostname
        .split(".")
        .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)));
  if (!validHostname || (port !== null && (port < 1 || port > 65535))) return "";
  return `${protocol}://${host}`;
};

const toAbsoluteUploadUrl = (req, relativePath = "") => {
  if (typeof relativePath !== "string" || !relativePath.trim()) return "";
  if (/^https?:\/\//i.test(relativePath)) return relativePath;
  const requestOrigin = getRequestOrigin(req);
  return requestOrigin ? `${requestOrigin}${relativePath}` : relativePath;
};

const MAX_PROFILE_PHOTOS = 6;
const MAX_EXTRA_PROFILE_PHOTOS = 5;
const MAX_INTERESTS = 10;
const MIN_ONBOARDING_INTERESTS = 3;
const ALLOWED_INTERESTED_IN = Object.keys(DISCOVERY_GENDER_MATCH);
const ALLOWED_GENDERS = ["male", "female", "other", "prefer_not_to_say", "man", "woman", "nonbinary", "", null];
const ALLOWED_DISCOVERY_GOALS = Object.keys(DISCOVERY_GOAL_INTENT_MAP);
const ALLOWED_DISCOVERY_LANGUAGES = ["es", "en", "pt"];
const ALLOWED_DISCOVERY_SCOPES = ["nearby", "country", "global"];
const ALLOWED_DISTANCE_OPTIONS = [5, 10, 25, 50, 100];
// Nearby filters are applied after fetching candidates, so this buffer reduces empty pages
// when many profiles fall outside the selected radius.
const LOCATION_FILTER_FETCH_MULTIPLIER = 5;

const normalizeLocationString = (value, maxLength = 80) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const isValidLatitude = (value) => Number.isFinite(value) && value >= -90 && value <= 90;
const isValidLongitude = (value) => Number.isFinite(value) && value >= -180 && value <= 180;

const parseCoordinatesInput = (input) => {
  if (Array.isArray(input)) {
    const lng = Number(input[0]);
    const lat = Number(input[1]);
    if (!isValidLatitude(lat) || !isValidLongitude(lng)) return { lat: null, lng: null };
    return { lat, lng };
  }
  if (!input || typeof input !== "object") return { lat: null, lng: null };
  const lat = Number(input.lat ?? input.latitude);
  const lng = Number(input.lng ?? input.longitude);
  if (!isValidLatitude(lat) || !isValidLongitude(lng)) return { lat: null, lng: null };
  return { lat, lng };
};

const parseLocationString = (value = "") => {
  // Legacy manual input is interpreted as "city, region, country"; any middle
  // comma-separated parts are preserved together as the optional region.
  const parts = normalizeLocationString(value, 160)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    city: parts[0] || "",
    country: parts.length > 1 ? parts[parts.length - 1] : "",
    region: parts.length > 2 ? parts.slice(1, -1).join(", ") : "",
  };
};

const parseLocationInput = (locationInput, locationLabelInput) => {
  const base =
    locationInput && typeof locationInput === "object" && !Array.isArray(locationInput)
      ? locationInput
      : parseLocationString(typeof locationInput === "string" ? locationInput : locationLabelInput);
  const country = normalizeLocationString(base.country);
  const city = normalizeLocationString(base.city);
  const region = normalizeLocationString(base.region);
  const coordinates = parseCoordinatesInput(base.coordinates || base);
  const explicitLabel = normalizeLocationString(locationLabelInput, 160);
  const locationLabel = explicitLabel || [city, region, country].filter(Boolean).join(", ");
  const location = {
    type: "Point",
    coordinates:
      isValidLatitude(coordinates.lat) && isValidLongitude(coordinates.lng)
        ? [coordinates.lng, coordinates.lat]
        : undefined,
    country,
    city,
    region,
    label: locationLabel,
  };
  return { location, locationLabel };
};

const parseMaxDistanceInput = (value) => {
  if (value === null || value === "" || value === "global") return null;
  const parsed = Number(value);
  // undefined means "ignore this malformed input"; null intentionally clears distance.
  if (!Number.isFinite(parsed)) return undefined;
  const distance = Math.max(1, Math.min(10000, Math.floor(parsed)));
  return ALLOWED_DISTANCE_OPTIONS.includes(distance) ? distance : Math.min(10000, distance);
};

/**
 * Check whether a user object meets the minimum profile requirements for
 * onboarding completion.
 * Required: name, photo, birthdate, location, gender, interestedIn,
 * intent, ≥ MIN_ONBOARDING_INTERESTS interests.
 */
const getMinProfileCompletion = (user = {}, req) => {
  const missingFields = getMissingProfileFields(user, { req });
  const feedEligible = canAppearInFeed(user, { req, missingFields });
  const status = getProfileCompletionStatus(user, { req });
  return {
    ...status,
    complete: feedEligible,
    profileComplete: status.complete,
    onboardingComplete: feedEligible,
    canAppearInFeed: feedEligible,
    missing: missingFields,
    missingFields,
  };
};

const getPhotoUrlValue = (value) => {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return value.secure_url || value.url || value.src || value.path || "";
};

const sanitizePhotoUrl = (req, value) => {
  const rawValue = getPhotoUrlValue(value);
  if (typeof rawValue !== "string") return "";
  const trimmed = rawValue.trim();
  if (!trimmed) return "";
  const requestOrigin = getRequestOrigin(req);
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      url.pathname = url.pathname.replace(/^\/api\/uploads\//, "/uploads/");
      if (requestOrigin) {
        const requestUrl = new URL(requestOrigin);
        if (
          url.protocol === "http:" &&
          requestUrl.protocol === "https:" &&
          url.hostname === requestUrl.hostname &&
          url.pathname.startsWith("/uploads/")
        ) {
          url.protocol = "https:";
        }
      }
      return url.toString();
    } catch {
      return "";
    }
  }
  if (trimmed.startsWith("//")) return `https:${trimmed}`;

  const normalizedPath = trimmed.replace(/^\/?(?:api\/)?uploads\//, "uploads/");
  if (/^uploads\/[a-zA-Z0-9._](?:[a-zA-Z0-9._-]*[a-zA-Z0-9._])?$/.test(normalizedPath)) {
    return toAbsoluteUploadUrl(req, `/${normalizedPath}`);
  }
  return "";
};

const normalizeProfilePhotos = (req, profilePhotosInput, avatarInput, currentUser) => {
  const currentImages = Array.isArray(currentUser?.images) ? currentUser.images : [];
  const currentProfilePhotos = Array.isArray(currentUser?.profilePhotos) ? currentUser.profilePhotos : [];
  const basePhotos = Array.isArray(profilePhotosInput)
    ? profilePhotosInput
    : currentImages.length > 0
    ? currentImages
    : currentProfilePhotos;

  const normalizedPhotos = [];
  for (const value of basePhotos) {
    const normalized = sanitizePhotoUrl(req, value);
    if (!normalized || normalizedPhotos.includes(normalized)) continue;
    normalizedPhotos.push(normalized);
    if (normalizedPhotos.length >= MAX_PROFILE_PHOTOS) break;
  }

  const currentAvatar = sanitizePhotoUrl(req, currentUser?.avatar || "");
  const nextAvatarExplicit = avatarInput !== undefined ? sanitizePhotoUrl(req, avatarInput) : null;
  let mainPhoto = nextAvatarExplicit !== null ? nextAvatarExplicit : currentAvatar;

  if (mainPhoto) {
    const deduped = [mainPhoto, ...normalizedPhotos.filter((url) => url !== mainPhoto)];
    return {
      avatar: mainPhoto,
      profilePhotos: deduped.slice(0, MAX_PROFILE_PHOTOS),
      images: deduped.slice(0, MAX_PROFILE_PHOTOS).map((url, index) => ({
        url,
        isPrimary: index === 0,
        source: "",
        uploadedAt: new Date(),
      })),
    };
  }

  if (normalizedPhotos.length > 0) {
    return {
      avatar: normalizedPhotos[0],
      profilePhotos: normalizedPhotos.slice(0, MAX_PROFILE_PHOTOS),
      images: normalizedPhotos.slice(0, MAX_PROFILE_PHOTOS).map((url, index) => ({
        url,
        isPrimary: index === 0,
        source: "",
        uploadedAt: new Date(),
      })),
    };
  }

  return { avatar: "", profilePhotos: [], images: [] };
};

const getExistingPhotoCandidates = (user) => [
  ...(Array.isArray(user?.images) ? user.images.map(getPhotoUrlValue) : []),
  ...(Array.isArray(user?.profilePhotos) ? user.profilePhotos : []),
  user?.avatar,
];

const serializeUserPhotoFields = (req, userLike) => {
  // Keep this priority aligned with frontend/lib/imageHelpers.js::getPrimaryProfileImage():
  // images[0] > avatar > profileImage > profilePhotos[0] > photo.
  const rawPhotos = [
    ...(Array.isArray(userLike?.images) ? userLike.images : []),
    userLike?.avatar,
    userLike?.profileImage,
    ...(Array.isArray(userLike?.profilePhotos) ? userLike.profilePhotos : []),
    userLike?.photo,
    ...(Array.isArray(userLike?.photos) ? userLike.photos : []),
    userLike?.photoURL,
    userLike?.photoUrl,
    userLike?.image,
    userLike?.imageUrl,
    userLike?.picture,
  ];
  const normalizedPhotos = [];
  for (const value of rawPhotos) {
    const normalized = sanitizePhotoUrl(req, value);
    if (normalized && !normalizedPhotos.includes(normalized)) normalizedPhotos.push(normalized);
  }
  const { avatar, profilePhotos, images } = normalizeProfilePhotos(
    req,
    normalizedPhotos,
    normalizedPhotos[0],
    userLike
  );
  // images[0] is canonical; aliases keep feed/public clients in sync.
  return {
    avatar,
    profileImage: avatar,
    photo: avatar,
    photos: profilePhotos,
    profilePhotos,
    images,
    maxExtraPhotos: MAX_EXTRA_PROFILE_PHOTOS,
  };
};

const parseSetAsMainParam = (query) => !(query?.setAsMain === "0" || query?.setAsMain === "false");

const getSafeUploadedFilePath = (file) => {
  if (!file?.filename) return "";
  const resolvedPath = path.resolve(uploadDir, path.basename(file.filename));
  return resolvedPath.startsWith(`${uploadDir}${path.sep}`) ? resolvedPath : "";
};

const doesFileExist = async (filePath) => {
  if (!filePath) return false;
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const parseDiscoveryPreferencesInput = (input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const updates = {};

  if (input.ageRange && typeof input.ageRange === "object" && !Array.isArray(input.ageRange)) {
    const minRaw = input.ageRange.min;
    const maxRaw = input.ageRange.max;
    const min = minRaw === null || minRaw === "" ? null : Number(minRaw);
    const max = maxRaw === null || maxRaw === "" ? null : Number(maxRaw);
    if ((min === null || Number.isFinite(min)) && (max === null || Number.isFinite(max))) {
      const sanitizedMin = min === null ? null : Math.max(18, Math.min(100, Math.floor(min)));
      const sanitizedMax = max === null ? null : Math.max(18, Math.min(100, Math.floor(max)));
      const minFinal =
        sanitizedMin !== null && sanitizedMax !== null ? Math.min(sanitizedMin, sanitizedMax) : sanitizedMin;
      const maxFinal =
        sanitizedMin !== null && sanitizedMax !== null ? Math.max(sanitizedMin, sanitizedMax) : sanitizedMax;
      updates.ageRange = { min: minFinal, max: maxFinal };
    }
  }

  if (input.maxDistanceKm !== undefined) {
    const parsedDistance = parseMaxDistanceInput(input.maxDistanceKm);
    if (parsedDistance !== undefined) updates.maxDistanceKm = parsedDistance;
  }

  if (input.discoveryScope !== undefined) {
    updates.discoveryScope = ALLOWED_DISCOVERY_SCOPES.includes(input.discoveryScope) ? input.discoveryScope : "global";
  }

  if (Array.isArray(input.languages)) {
    updates.languages = input.languages
      .map((lang) => (typeof lang === "string" ? lang.trim() : ""))
      .filter((lang) => ALLOWED_DISCOVERY_LANGUAGES.includes(lang))
      .slice(0, ALLOWED_DISCOVERY_LANGUAGES.length);
  }

  if (Array.isArray(input.goals)) {
    updates.goals = input.goals
      .map((goal) => (typeof goal === "string" ? goal.trim() : ""))
      .filter((goal) => ALLOWED_DISCOVERY_GOALS.includes(goal))
      .slice(0, ALLOWED_DISCOVERY_GOALS.length);
  }

  return Object.keys(updates).length > 0 ? updates : null;
};

// Public profile — returns safe fields for a given user/creator
router.get("/:id/public", userLimiter, optionalVerifyToken, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const user = await User.findOne({
      _id: req.params.id,
      role: { $nin: ["admin", "moderator"] },
      isBlocked: { $ne: true },
      isSuspended: { $ne: true },
    })
      .select("displayName name firstName lastName username avatar profilePhotos photos images profileImage photo photoURL photoUrl image imageUrl picture bio role creatorStatus isVerifiedCreator creatorProfile interests location")
      .lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    const profile = { ...user };
    const photoFields = serializeUserPhotoFields(req, profile);
    Object.assign(profile, photoFields);
    const activeLive = await Live.findOne({ user: profile._id, isLive: true }).select("_id");
    profile.isLive = !!activeLive;
    profile.liveId = activeLive ? String(activeLive._id) : null;
    res.json(profile);
  } catch (err) {
    if (err.name === "CastError") return res.status(400).json({ message: "ID inválido" });
    res.status(500).json({ message: err.message });
  }
});

router.get("/me", userLimiter, verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    // Normalize legacy data: a user whose role is already "creator" but whose
    // creatorStatus was never written to "approved" (approved via older code
    // that only set role) should be treated as an approved creator.  Only
    // "suspended" is an intentional non-approved creator state, so everything
    // else is silently corrected here.
    if (user.role === "creator" && user.creatorStatus !== "approved" && user.creatorStatus !== "suspended") {
      user.creatorStatus = "approved";
      User.updateOne({ _id: user._id }, { $set: { creatorStatus: "approved" } }).catch((err) => {
        console.error("[/me] Failed to normalize creatorStatus for user", user._id, err.message);
      });
    }

    const payload = user.toObject();
    const compatibilityUpdates = getDiscoveryCompatibilityUpdates(payload);
    if (Object.keys(compatibilityUpdates).length > 0) {
      Object.assign(payload, compatibilityUpdates);
      User.updateOne({ _id: user._id }, { $set: compatibilityUpdates }).catch(() => {});
    }
    Object.assign(payload, normalizeDiscoveryCompatibility(payload));
    const photoFields = serializeUserPhotoFields(req, payload);
    Object.assign(payload, photoFields);
    const persistedImageUrls = Array.isArray(user.images)
      ? user.images.map(getPhotoUrlValue).filter((url) => sanitizePhotoUrl(req, url))
      : [];
    if (persistedImageUrls.length === 0 && photoFields.images.length > 0) {
      User.updateOne(
        { _id: user._id },
        {
          $set: {
            avatar: photoFields.avatar,
            profilePhotos: photoFields.profilePhotos,
            images: photoFields.images,
          },
        }
      ).catch(() => {});
    }
    // Defensive fallbacks: guarantee role and creatorStatus are always present
    // even for documents created before these fields were added to the schema.
    if (payload.role == null) payload.role = "user";
    if (payload.creatorStatus == null) payload.creatorStatus = "none";

    // Keep persisted onboardingComplete aligned with the canonical feed
    // eligibility helper so legacy profiles do not get stuck incomplete.
    const profileCompletion = getMinProfileCompletion(payload, req);
    const feedEligible = profileCompletion.canAppearInFeed;
    if (payload.onboardingComplete !== feedEligible) {
      payload.onboardingComplete = feedEligible;
      User.updateOne({ _id: user._id }, { $set: { onboardingComplete: feedEligible } }).catch((err) => {
        console.error("[lazy-onboarding-sync] failed:", err.message);
      });
    }
    payload.profileCompletion = profileCompletion;
    payload.profileCompletionStatus = profileCompletion;
    payload.canAppearInFeed = feedEligible;
    payload.missingFields = profileCompletion.missingFields;

    res.json(payload);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/coins", userLimiter, verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("coins sparks earningsCoins");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json({ coins: user.coins, sparks: user.sparks, earningsCoins: user.earningsCoins });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch("/me", userLimiter, verifyToken, async (req, res) => {
  try {
    const {
      username,
      name,
      bio,
      avatar,
      images,
      profilePhotos,
      photos,
      profileImage,
      photo,
      photoUrl,
      preferredLanguage,
      intent,
      gender,
      interestedIn,
      location,
      locationLabel,
      maxDistanceKm,
      discoveryScope,
      discoveryPreferences,
    } = req.body;
    const currentUser = await User.findById(req.userId).select("avatar profilePhotos images");
    if (!currentUser) return res.status(404).json({ message: "Usuario no encontrado" });
    const updates = {};
    if (username !== undefined) {
      const trimmed = username.trim();
      if (trimmed.length > 0) updates.username = trimmed;
    }
    if (name !== undefined) {
      const trimmed = name.trim();
      if (trimmed.length > 0) updates.name = trimmed;
    }
    if (bio !== undefined) updates.bio = bio.trim();
    const incomingAvatar = photoUrl ?? avatar ?? profileImage ?? photo;
    const incomingProfilePhotos = images ?? profilePhotos ?? photos;
    if (incomingAvatar !== undefined || incomingProfilePhotos !== undefined) {
      const normalizedPhotoState = normalizeProfilePhotos(req, incomingProfilePhotos, incomingAvatar, currentUser);
      updates.avatar = normalizedPhotoState.avatar;
      updates.profilePhotos = normalizedPhotoState.profilePhotos;
      updates.images = normalizedPhotoState.images;
    }
    if (preferredLanguage !== undefined) {
      const allowedLangs = ["es", "en", "pt"];
      if (allowedLangs.includes(preferredLanguage)) {
        updates.preferredLanguage = preferredLanguage;
      }
    }
    if (intent !== undefined) {
      const allowedIntents = ["dating", "casual", "live", "creator", ""];
      if (allowedIntents.includes(intent)) updates.intent = intent;
    }
    if (gender !== undefined) {
      if (ALLOWED_GENDERS.includes(gender)) updates.gender = gender === "" ? null : gender;
    }
    if (interestedIn !== undefined) {
      if (interestedIn === "") updates.interestedIn = "both";
      else if (ALLOWED_INTERESTED_IN.includes(interestedIn)) updates.interestedIn = interestedIn;
    }
    if (location !== undefined || locationLabel !== undefined) {
      const parsedLocation = parseLocationInput(location, locationLabel);
      updates.location = parsedLocation.location;
      updates.locationLabel = parsedLocation.locationLabel;
    }
    if (maxDistanceKm !== undefined) {
      const parsedDistance = parseMaxDistanceInput(maxDistanceKm);
      if (parsedDistance !== undefined) {
        updates.maxDistanceKm = parsedDistance;
        updates.discoveryPreferences = {
          ...(updates.discoveryPreferences || {}),
          maxDistanceKm: parsedDistance,
        };
      }
    }
    if (discoveryScope !== undefined && ALLOWED_DISCOVERY_SCOPES.includes(discoveryScope)) {
      updates.discoveryScope = discoveryScope;
      updates.discoveryPreferences = {
        ...(updates.discoveryPreferences || {}),
        discoveryScope,
      };
    }
    if (discoveryPreferences !== undefined) {
      const parsedDiscoveryPreferences = parseDiscoveryPreferencesInput(discoveryPreferences);
      if (parsedDiscoveryPreferences) {
        updates.discoveryPreferences = {
          ...(updates.discoveryPreferences || {}),
          ...parsedDiscoveryPreferences,
        };
        if (parsedDiscoveryPreferences.maxDistanceKm !== undefined) {
          updates.maxDistanceKm = parsedDiscoveryPreferences.maxDistanceKm;
        }
        if (parsedDiscoveryPreferences.discoveryScope !== undefined) {
          updates.discoveryScope = parsedDiscoveryPreferences.discoveryScope;
        }
      }
    }

    if (updates.username) {
      const existing = await User.findOne({ username: updates.username, _id: { $ne: currentUser._id } });
      if (existing) {
        return res.status(400).json({ message: "Este nombre de usuario ya está en uso" });
      }
    }

    const user = await User.findByIdAndUpdate(currentUser._id, updates, { new: true }).select("-password");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    const payload = user.toObject();
    const photoFields = serializeUserPhotoFields(req, payload);
    Object.assign(payload, photoFields);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch("/me/password", userLimiter, verifyToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "La contraseña actual y la nueva son requeridas" });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ message: "La nueva contraseña debe tener al menos 6 caracteres" });
  }
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(401).json({ message: "La contraseña actual es incorrecta" });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ message: "Contraseña actualizada correctamente" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.patch("/me/onboarding", userLimiter, verifyToken, async (req, res) => {
  try {
    const {
      avatar,
      profilePhotos,
      photos,
      images,
      profileImage,
      photo,
      photoUrl,
      gender,
      birthdate,
      interests,
      location,
      name,
      bio,
      intent,
      interestedIn,
      locationLabel,
      maxDistanceKm,
      discoveryScope,
      discoveryPreferences,
    } = req.body;
    const currentUser = await User.findById(req.userId).select(
      "name avatar profilePhotos images birthdate location locationLabel gender interestedIn interests intent role isBlocked isSuspended"
    );
    if (!currentUser) return res.status(404).json({ message: "Usuario no encontrado" });
    const updates = {};
    // images[0] is canonical; aliases are accepted to avoid dropping photos.
    const incomingAvatar = photoUrl ?? avatar ?? profileImage ?? photo;
    const incomingProfilePhotos = images ?? profilePhotos ?? photos;

    if (incomingAvatar !== undefined || incomingProfilePhotos !== undefined) {
      const normalizedPhotoState = normalizeProfilePhotos(req, incomingProfilePhotos, incomingAvatar, currentUser);
      updates.avatar = normalizedPhotoState.avatar;
      updates.profilePhotos = normalizedPhotoState.profilePhotos;
      updates.images = normalizedPhotoState.images;
    }
    if (gender !== undefined && ALLOWED_GENDERS.includes(gender)) updates.gender = gender === "" ? null : gender;
    if (birthdate !== undefined) updates.birthdate = birthdate ? new Date(birthdate) : null;
    if (Array.isArray(interests)) updates.interests = interests.slice(0, MAX_INTERESTS);
    if (location !== undefined || locationLabel !== undefined) {
      const parsedLocation = parseLocationInput(location, locationLabel);
      updates.location = parsedLocation.location;
      updates.locationLabel = parsedLocation.locationLabel;
    }
    if (name !== undefined) {
      const trimmed = name.trim();
      if (trimmed.length > 0) updates.name = trimmed;
    }
    if (bio !== undefined) updates.bio = bio.trim();
    if (intent !== undefined) {
      const allowedIntents = ["dating", "casual", "live", "creator", ""];
      if (allowedIntents.includes(intent)) updates.intent = intent;
    }
    if (interestedIn !== undefined) {
      if (interestedIn === "") updates.interestedIn = "both";
      else if (ALLOWED_INTERESTED_IN.includes(interestedIn)) updates.interestedIn = interestedIn;
    }
    if (maxDistanceKm !== undefined) {
      const parsedDistance = parseMaxDistanceInput(maxDistanceKm);
      if (parsedDistance !== undefined) {
        updates.maxDistanceKm = parsedDistance;
        updates.discoveryPreferences = {
          ...(updates.discoveryPreferences || {}),
          maxDistanceKm: parsedDistance,
        };
      }
    }
    if (discoveryScope !== undefined && ALLOWED_DISCOVERY_SCOPES.includes(discoveryScope)) {
      updates.discoveryScope = discoveryScope;
      updates.discoveryPreferences = {
        ...(updates.discoveryPreferences || {}),
        discoveryScope,
      };
    }
    if (discoveryPreferences !== undefined) {
      const parsedDiscoveryPreferences = parseDiscoveryPreferencesInput(discoveryPreferences);
      if (parsedDiscoveryPreferences) {
        updates.discoveryPreferences = {
          ...(updates.discoveryPreferences || {}),
          ...parsedDiscoveryPreferences,
        };
        if (parsedDiscoveryPreferences.maxDistanceKm !== undefined) {
          updates.maxDistanceKm = parsedDiscoveryPreferences.maxDistanceKm;
        }
        if (parsedDiscoveryPreferences.discoveryScope !== undefined) {
          updates.discoveryScope = parsedDiscoveryPreferences.discoveryScope;
        }
      }
    }

    // Determine whether the merged profile state meets minimum requirements
    // and only mark onboardingComplete: true when it does.
    const mergedUser = { ...currentUser.toObject(), ...updates };
    const profileCompletion = getMinProfileCompletion(mergedUser, req);
    updates.onboardingComplete = profileCompletion.canAppearInFeed;

    const user = await User.findByIdAndUpdate(currentUser._id, updates, { new: true }).select("-password");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    const payload = user.toObject();
    const photoFields = serializeUserPhotoFields(req, payload);
    Object.assign(payload, photoFields);
    payload.profileCompletion = getMinProfileCompletion(payload, req);
    payload.onboardingComplete = payload.profileCompletion.canAppearInFeed;
    payload.canAppearInFeed = payload.profileCompletion.canAppearInFeed;
    payload.missingFields = payload.profileCompletion.missingFields;
    res.json({
      user: payload,
      onboardingComplete: payload.onboardingComplete,
      canAppearInFeed: payload.canAppearInFeed,
      missingFields: payload.missingFields,
      profileCompletion: payload.profileCompletion,
      profileCompletionStatus: payload.profileCompletion,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch("/me/avatar", userLimiter, verifyToken, async (req, res) => {
  try {
    const { avatar } = req.body;
    if (!avatar || typeof avatar !== "string") {
      return res.status(400).json({ message: "avatar (URL) es requerido" });
    }
    const currentUser = await User.findById(req.userId).select("avatar profilePhotos images");
    if (!currentUser) return res.status(404).json({ message: "Usuario no encontrado" });
    const normalizedPhotoState = normalizeProfilePhotos(req, undefined, avatar, currentUser);
    const user = await User.findByIdAndUpdate(
      req.userId,
      {
        avatar: normalizedPhotoState.avatar,
        profilePhotos: normalizedPhotoState.profilePhotos,
        images: normalizedPhotoState.images,
      },
      { new: true }
    ).select("-password");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    const payload = user.toObject();
    const photoFields = serializeUserPhotoFields(req, payload);
    Object.assign(payload, photoFields);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/discover", userLimiter, verifyToken, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const skip = (page - 1) * limit;

    // Fetch the current user's interests and intent for compatibility scoring
    const me = await User.findById(req.userId).select(
      "interests intent gender interestedIn discoveryPreferences location locationLabel maxDistanceKm discoveryScope"
    );
    const myInterests = me?.interests || [];
    const myIntent = me?.intent || "";
    const discoveryFilters = buildDiscoveryMatch(me);
    const locationMatch = buildDiscoveryLocationMatch(me);
    const mergedDiscoveryFilters = combineDiscoveryFilters(discoveryFilters, locationMatch);

    const now = new Date();

    // Boosted users (active boost) appear first, then newest first.
    // Exclude all staff roles from public discovery
    const fetchedUsers = await User.aggregate([
      {
        $match: {
          _id: { $ne: new mongoose.Types.ObjectId(req.userId) },
          isBlocked: false,
          onboardingComplete: true,
          role: { $nin: STAFF_ROLES },
          ...mergedDiscoveryFilters,
        },
      },
      {
        $addFields: {
          _boostRank: {
            $cond: [{ $gt: ["$crushBoostUntil", now] }, 1, 0],
          },
        },
      },
      { $sort: { _boostRank: -1, createdAt: -1 } },
      { $limit: Math.min(skip + limit * LOCATION_FILTER_FETCH_MULTIPLIER, 250) },
      {
        $project: {
          username: 1, name: 1, avatar: 1, bio: 1, gender: 1,
          profilePhotos: 1, photos: 1, profileImage: 1, photo: 1,
          interests: 1, intent: 1, location: 1, locationLabel: 1, role: 1,
          creatorProfile: 1, birthdate: 1,
          followersCount: 1, isVerified: 1, isPremium: 1,
          isBoosted: { $gt: ["$crushBoostUntil", now] },
        },
      },
    ]);
    const users = applyDiscoveryLocationFilter(me, fetchedUsers).slice(skip, skip + limit);

    // Enrich with live status for creator accounts
    const userIds = users.map((u) => u._id);
    const activeLives = await Live.find({ user: { $in: userIds }, isLive: true }).select("user _id");
    const liveByUser = {};
    activeLives.forEach((l) => { liveByUser[String(l.user)] = String(l._id); });

    const enriched = users.map((u) => {
      const liveId = liveByUser[String(u._id)] || null;
      u.isLive = !!liveId;
      u.liveId = liveId;

      // Compatibility score
      const { compatibilityScore, sharedInterests } = calculateCompatibility(
        myInterests, myIntent, u.interests || [], u.intent || ""
      );

      Object.assign(u, serializeUserPhotoFields(req, u));
      u.sharedInterests = sharedInterests;
      u.compatibilityScore = compatibilityScore;

      return u;
    });

    res.json({ users: enriched, page, limit });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/me/creator-request", userLimiter, verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    if (user.role !== "user") {
      return res.status(400).json({ message: "Solo los usuarios normales pueden solicitar ser creadores" });
    }

    if (user.creatorStatus === "pending") {
      return res.status(400).json({ message: "Ya tienes una solicitud de creador pendiente" });
    }

    const { displayName, bio, category, country, languages, socialLinks } = req.body;

    if (!displayName || !displayName.trim()) {
      return res.status(400).json({ message: "El nombre de creador es requerido" });
    }
    if (!bio || !bio.trim()) {
      return res.status(400).json({ message: "La biografía es requerida" });
    }
    if (!category || !category.trim()) {
      return res.status(400).json({ message: "La categoría es requerida" });
    }
    if (!country || !country.trim()) {
      return res.status(400).json({ message: "El país es requerido" });
    }
    if (!languages || !Array.isArray(languages) || languages.length === 0) {
      return res.status(400).json({ message: "Debes seleccionar al menos un idioma" });
    }

    const filteredLanguages = languages.filter((l) => l && l.trim());
    if (filteredLanguages.length === 0) {
      return res.status(400).json({ message: "Debes seleccionar al menos un idioma válido" });
    }

    const sanitizedSocialLinks = {
      twitter: (socialLinks?.twitter || "").trim(),
      instagram: (socialLinks?.instagram || "").trim(),
      tiktok: (socialLinks?.tiktok || "").trim(),
      youtube: (socialLinks?.youtube || "").trim(),
    };

    user.creatorApplication = {
      displayName: displayName.trim(),
      bio: bio.trim(),
      category: category.trim(),
      country: country.trim(),
      languages: filteredLanguages.map((l) => l.trim()),
      socialLinks: sanitizedSocialLinks,
      submittedAt: new Date(),
    };
    user.creatorStatus = "pending";
    await user.save();

    res.json({
      message: "Solicitud enviada correctamente. Un administrador la revisará pronto.",
      user: { role: user.role, creatorStatus: user.creatorStatus },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch("/me/creator-profile", userLimiter, verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    if (user.role !== "creator") {
      return res.status(403).json({ message: "Solo los creadores pueden actualizar su perfil de creador" });
    }

    const allowed = [
      "displayName",
      "bio",
      "category",
      "pricePerMinute",
      "privateCallEnabled",
      "giftsEnabled",
      "exclusiveContentEnabled",
      "liveEnabled",
    ];

    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[`creatorProfile.${key}`] = req.body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No se proporcionaron campos para actualizar" });
    }

    const updated = await User.findByIdAndUpdate(req.userId, { $set: updates }, { new: true }).select("-password");
    if (!updated) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Upload profile photo (multipart/form-data, field "avatar")
router.post("/me/avatar-upload", userLimiter, enableAvatarUploadDiagnostics, verifyToken, (req, res, next) => {
  upload.single("avatar")(req, res, (err) => {
    if (err) {
      return sendUploadError(res, err, "Error al subir la imagen");
    }
    // TODO(2026-06-14): Remove temporary upload diagnostics after onboarding photo issue is resolved.
    console.log("FILE RECEIVED", req.file);
    console.log("[avatar-upload] request file received", {
      userId: req.userId,
      hasFile: Boolean(req.file),
      fieldname: req.file?.fieldname,
      mimetype: req.file?.mimetype,
      size: req.file?.size,
    });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return sendAvatarUploadJsonError(res, 400, "FILE_REQUIRED", "No se recibió archivo.", "File required");
    }
    const avatarPath = `/uploads/${req.file.filename}`;
    const photoUrl = toAbsoluteUploadUrl(req, avatarPath);
    const safeUploadedFilePath = getSafeUploadedFilePath(req.file);
    const physicalFileExists = await doesFileExist(safeUploadedFilePath);
    // TODO(2026-06-14): Remove temporary upload diagnostics after onboarding photo issue is resolved.
    console.log("PHOTO URL", photoUrl);
    console.log("[avatar-upload] generated URL and disk state", {
      userId: req.userId,
      avatarPath,
      photoUrl,
      physicalPathValidated: Boolean(safeUploadedFilePath),
      physicalFileExists,
      setAsMain: req.query?.setAsMain,
    });
    if (!physicalFileExists) {
      console.error("[avatar-upload] uploaded file missing from disk", {
        userId: req.userId,
        filename: req.file.filename,
        path: safeUploadedFilePath,
      });
      return sendAvatarUploadJsonError(res, 500, "FILE_SAVE_FAILED", "Error guardando archivo.", "File not found after upload");
    }
    const user = await User.findById(req.userId).select("-password");
    if (!user) {
      return sendAvatarUploadJsonError(res, 404, "USER_NOT_FOUND", "Usuario no encontrado.", "User not found");
    }
    const shouldSetAsMain = parseSetAsMainParam(req.query);
    const existingPhotoCandidates = getExistingPhotoCandidates(user);
    const candidateProfilePhotos = shouldSetAsMain
      ? [photoUrl, ...existingPhotoCandidates]
      : [...existingPhotoCandidates, photoUrl];
    const normalizedPhotoState = normalizeProfilePhotos(
      req,
      candidateProfilePhotos,
      shouldSetAsMain ? photoUrl : undefined,
      user
    );
    const nextAvatar = normalizedPhotoState.avatar;
    const nextProfilePhotos = normalizedPhotoState.profilePhotos;
    const nextImages = normalizedPhotoState.images;

    const uploadResult = {
      avatar: nextAvatar,
      profilePhotos: nextProfilePhotos,
      images: nextImages,
    };
    // TODO(2026-06-14): Remove temporary upload diagnostics after onboarding photo issue is resolved.
    console.log("UPLOAD RESULT", uploadResult);
    const savedUser = await User.findByIdAndUpdate(
      user._id,
      {
        $set: {
          avatar: nextAvatar,
          profilePhotos: nextProfilePhotos,
          images: nextImages,
        },
      },
      { new: true }
    ).select("-password");
    if (!savedUser) {
      return sendAvatarUploadJsonError(res, 404, "USER_NOT_FOUND", "Usuario no encontrado.", "User not found");
    }
    // TODO(2026-06-14): Remove temporary upload diagnostics after onboarding photo issue is resolved.
    console.log("USER SAVED", savedUser._id);
    // TODO(2026-06-14): Remove temporary upload diagnostics after onboarding photo issue is resolved.
    console.log("[avatar-upload] MongoDB photo fields saved", {
      userId: req.userId,
      avatar: savedUser.avatar,
      profilePhotos: savedUser.profilePhotos,
      imagesCount: Array.isArray(savedUser.images) ? savedUser.images.length : 0,
      images0Url: savedUser.images?.[0]?.url || "",
      images0IsPrimary: savedUser.images?.[0]?.isPrimary,
    });

    const savedUserObject = savedUser.toObject();
    const photoFields = serializeUserPhotoFields(req, savedUserObject);
    const serializedUser = { ...savedUserObject, ...photoFields };
    res.json({
      ok: true,
      code: "UPLOAD_SUCCESS",
      message: "Imagen subida correctamente",
      avatar: photoFields.avatar,
      profileImage: photoFields.profileImage,
      avatarPath,
      // Keep legacy aliases for existing onboarding/profile clients while
      // avatar/profilePhotos/images remain the canonical saved fields.
      photo: photoUrl,
      photoUrl,
      url: photoFields.avatar,
      mainPhoto: photoFields.avatar,
      photos: photoFields.photos,
      profilePhotos: photoFields.profilePhotos,
      images: serializedUser.images,
      maxExtraPhotos: photoFields.maxExtraPhotos,
      user: serializedUser,
    });
  } catch (err) {
    // TODO(2026-06-14): Remove temporary upload diagnostics after onboarding photo issue is resolved.
    console.error("[avatar-upload] failed after multer", {
      userId: req.userId,
      name: err?.name,
      message: err?.message,
      hasFile: Boolean(req.file),
    });
    res
      .status(500)
      .json(uploadErrorPayload(500, "UPLOAD_FAILED", "No se pudo procesar la subida de la imagen.", err?.message || "Upload failed"));
  }
});

// Legacy verification-photo uploads no longer create admin review queues.
router.post("/me/verification-photo", userLimiter, verifyToken, async (req, res) => {
  res.status(410).json({
    ok: false,
    code: "VERIFICATION_REVIEW_DISABLED",
    message: "La revisión manual de usuarios normales ya no es necesaria. Tus fotos de perfil se publican automáticamente.",
  });
});

// Follow a creator/user
router.post("/:id/follow", userLimiter, verifyToken, async (req, res) => {
  try {
    const targetId = req.params.id;
    if (targetId === req.userId.toString()) {
      return res.status(400).json({ message: "No puedes seguirte a ti mismo" });
    }
    const target = await User.findById(targetId).select("_id followersCount");
    if (!target) return res.status(404).json({ message: "Usuario no encontrado" });

    const alreadyFollowing = await User.exists({ _id: req.userId, following: targetId });
    if (alreadyFollowing) {
      return res.json({ following: true, followersCount: target.followersCount });
    }

    await User.bulkWrite([
      { updateOne: { filter: { _id: req.userId }, update: { $addToSet: { following: targetId } } } },
      { updateOne: { filter: { _id: targetId }, update: { $addToSet: { followers: req.userId }, $inc: { followersCount: 1 } } } },
    ]);
    const updated = await User.findById(targetId).select("followersCount");
    res.json({ following: true, followersCount: updated.followersCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Unfollow a creator/user
router.delete("/:id/follow", userLimiter, verifyToken, async (req, res) => {
  try {
    const targetId = req.params.id;
    const target = await User.findById(targetId).select("followersCount");
    if (!target) return res.status(404).json({ message: "Usuario no encontrado" });

    await User.bulkWrite([
      { updateOne: { filter: { _id: req.userId }, update: { $pull: { following: targetId } } } },
      { updateOne: { filter: { _id: targetId }, update: { $pull: { followers: req.userId }, $inc: { followersCount: -1 } } } },
    ]);
    const updated = await User.findById(targetId).select("followersCount");
    res.json({ following: false, followersCount: updated?.followersCount ?? 0 });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Check follow status
router.get("/:id/follow", userLimiter, verifyToken, async (req, res) => {
  try {
    const targetId = req.params.id;
    const isFollowing = await User.exists({ _id: req.userId, following: targetId });
    const target = await User.findById(targetId).select("followersCount");
    res.json({ following: !!isFollowing, followersCount: target?.followersCount ?? 0 });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Register / update FCM push notification token
router.patch("/me/push-token", userLimiter, verifyToken, async (req, res) => {
  const { pushToken } = req.body;
  if (pushToken !== null && typeof pushToken !== "string") {
    return res.status(400).json({ message: "pushToken debe ser una cadena o null" });
  }
  try {
    await User.updateOne({ _id: req.userId }, { pushToken: pushToken || null });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Online users — returns basic profiles of users currently connected via socket
router.get("/online", userLimiter, verifyToken, async (req, res) => {
  try {
    const snapshot = getOnlineUsers();
    const otherUserIds = snapshot
      .map((e) => e.userId)
      .filter((id) => id !== String(req.userId));

    if (otherUserIds.length === 0) {
      return res.json({ users: [] });
    }

    const users = await User.find(
      { _id: { $in: otherUserIds }, isBlocked: false },
      "username name avatar role creatorStatus interests location intent"
    ).lean();

    // Attach lastSeen from the in-memory snapshot
    const lastSeenMap = {};
    snapshot.forEach((e) => { lastSeenMap[e.userId] = e.lastSeen; });

    const enriched = users.map((u) => ({
      ...u,
      lastSeen: lastSeenMap[String(u._id)] ?? null,
      isOnline: true,
    }));

    res.json({ users: enriched });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Validate creator invite code and return inviter info (public endpoint)
router.get("/creator-invite-info", userLimiter, async (req, res) => {
  try {
    const code = req.query.code ? String(req.query.code).trim().toUpperCase() : "";
    if (!code) {
      return res.status(400).json({ valid: false, message: "Código requerido" });
    }

    const inviter = await User.findOne({
      creatorInviteCode: code,
      role: "creator",
      creatorStatus: "approved",
    }).select("username name avatar creatorProfile");

    if (!inviter) {
      return res.json({ valid: false, message: "Código inválido o expirado" });
    }

    res.json({
      valid: true,
      creator: {
        id: inviter._id,
        username: inviter.username,
        name: inviter.name,
        avatar: inviter.avatar,
        displayName: inviter.creatorProfile?.displayName || inviter.name || inviter.username,
      },
    });
  } catch (err) {
    console.error("[creator-invite-info] Error:", err);
    res.status(500).json({ valid: false, message: err.message });
  }
});

module.exports = router;
