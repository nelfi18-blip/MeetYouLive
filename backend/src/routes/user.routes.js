const { Router } = require("express");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const multer = require("multer");
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
  buildDiscoveryMatch,
  getDiscoveryCompatibilityUpdates,
  normalizeDiscoveryCompatibility,
} = require("../lib/discovery.js");

const router = Router();

const userLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

const sendUploadError = (res, err, fallbackMessage = "Error al subir la imagen") => {
  if (!err) {
    return res.status(500).json({
      ok: false,
      code: "UPLOAD_FAILED",
      message: fallbackMessage,
    });
  }

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        ok: false,
        code: "FILE_TOO_LARGE",
        message: "La imagen es demasiado grande. El máximo permitido es 5 MB.",
      });
    }

    return res.status(400).json({
      ok: false,
      code: "UPLOAD_INVALID_REQUEST",
      message: err.message || fallbackMessage,
    });
  }

  if (typeof err.message === "string" && err.message.includes("Solo se permiten imágenes")) {
    return res.status(415).json({
      ok: false,
      code: "UNSUPPORTED_MEDIA_TYPE",
      message: "Formato de imagen no válido. Usa JPG, PNG, WebP o GIF.",
    });
  }

  return res.status(500).json({
    ok: false,
    code: "UPLOAD_FAILED",
    message: fallbackMessage,
  });
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
const ALLOWED_GENDERS = ["man", "woman", "nonbinary", "other", "", null];
const ALLOWED_DISCOVERY_GOALS = Object.keys(DISCOVERY_GOAL_INTENT_MAP);
const ALLOWED_DISCOVERY_LANGUAGES = ["es", "en", "pt"];

/**
 * Check whether a user object meets the minimum profile requirements for
 * onboarding completion.
 * Required: photo, birthdate, location, gender, interestedIn, ≥ MIN_ONBOARDING_INTERESTS interests.
 */
const getMinProfileCompletion = (user = {}) => {
  const hasPhoto = typeof user.avatar === "string" && user.avatar.trim().length > 0;
  const hasBirthdate = Boolean(user.birthdate);
  const hasLocation = typeof user.location === "string" && user.location.trim().length > 0;
  const hasGender = typeof user.gender === "string" && user.gender.trim().length > 0;
  const hasInterestedIn = typeof user.interestedIn === "string" && user.interestedIn.trim().length > 0;
  const hasInterests = Array.isArray(user.interests) && user.interests.length >= MIN_ONBOARDING_INTERESTS;

  const fields = [
    { key: "photo", done: hasPhoto },
    { key: "birthdate", done: hasBirthdate },
    { key: "location", done: hasLocation },
    { key: "gender", done: hasGender },
    { key: "interestedIn", done: hasInterestedIn },
    { key: "interests", done: hasInterests },
  ];
  const missing = fields.filter((f) => !f.done).map((f) => f.key);
  const percent = Math.round(((fields.length - missing.length) / fields.length) * 100);
  return { complete: missing.length === 0, percent, missing };
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
  const basePhotos = Array.isArray(profilePhotosInput)
    ? profilePhotosInput
    : Array.isArray(currentUser?.profilePhotos)
    ? currentUser.profilePhotos
    : [];

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
    };
  }

  if (normalizedPhotos.length > 0) {
    return {
      avatar: normalizedPhotos[0],
      profilePhotos: normalizedPhotos.slice(0, MAX_PROFILE_PHOTOS),
    };
  }

  return { avatar: "", profilePhotos: [] };
};

const serializeUserPhotoFields = (req, userLike) => {
  const rawPhotos = [
    ...(Array.isArray(userLike?.profilePhotos) ? userLike.profilePhotos : []),
    ...(Array.isArray(userLike?.photos) ? userLike.photos : []),
    ...(Array.isArray(userLike?.images) ? userLike.images : []),
    userLike?.avatar,
    userLike?.profileImage,
    userLike?.photo,
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
  const { avatar, profilePhotos } = normalizeProfilePhotos(
    req,
    normalizedPhotos,
    normalizedPhotos[0],
    userLike
  );
  // profilePhotos is the canonical persisted field; aliases keep feed/public clients in sync.
  return {
    avatar,
    profileImage: avatar,
    photo: avatar,
    photos: profilePhotos,
    profilePhotos,
    maxExtraPhotos: MAX_EXTRA_PROFILE_PHOTOS,
  };
};

const parseSetAsMainParam = (query) => !(query?.setAsMain === "0" || query?.setAsMain === "false");

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
    if (input.maxDistanceKm === null || input.maxDistanceKm === "") {
      updates.maxDistanceKm = null;
    } else {
      const parsedDistance = Number(input.maxDistanceKm);
      if (Number.isFinite(parsedDistance)) {
        updates.maxDistanceKm = Math.max(1, Math.min(10000, Math.floor(parsedDistance)));
      }
    }
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
    profile.avatar = photoFields.avatar;
    profile.profileImage = photoFields.profileImage;
    profile.photo = photoFields.photo;
    profile.photos = photoFields.photos;
    profile.profilePhotos = photoFields.profilePhotos;
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
    payload.avatar = photoFields.avatar;
    payload.profilePhotos = photoFields.profilePhotos;
    // Defensive fallbacks: guarantee role and creatorStatus are always present
    // even for documents created before these fields were added to the schema.
    if (payload.role == null) payload.role = "user";
    if (payload.creatorStatus == null) payload.creatorStatus = "none";

    // Compute profile completion and lazily reset onboardingComplete when a
    // previously-marked-complete user is now missing required fields (e.g. from
    // a stricter requirement rollout).
    const profileCompletion = getMinProfileCompletion(payload);
    if (payload.onboardingComplete === true && !profileCompletion.complete) {
      payload.onboardingComplete = false;
      User.updateOne({ _id: user._id }, { $set: { onboardingComplete: false } }).catch(() => {});
    }
    payload.profileCompletion = profileCompletion;

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
      profilePhotos,
      preferredLanguage,
      intent,
      gender,
      interestedIn,
      discoveryPreferences,
    } = req.body;
    const currentUser = await User.findById(req.userId).select("avatar profilePhotos");
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
    if (avatar !== undefined || profilePhotos !== undefined) {
      const normalizedPhotoState = normalizeProfilePhotos(req, profilePhotos, avatar, currentUser);
      updates.avatar = normalizedPhotoState.avatar;
      updates.profilePhotos = normalizedPhotoState.profilePhotos;
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
    if (discoveryPreferences !== undefined) {
      const parsedDiscoveryPreferences = parseDiscoveryPreferencesInput(discoveryPreferences);
      if (parsedDiscoveryPreferences) updates.discoveryPreferences = parsedDiscoveryPreferences;
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
    payload.avatar = photoFields.avatar;
    payload.profilePhotos = photoFields.profilePhotos;
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
      gender,
      birthdate,
      interests,
      location,
      name,
      bio,
      intent,
      interestedIn,
      discoveryPreferences,
    } = req.body;
    const currentUser = await User.findById(req.userId).select(
      "avatar profilePhotos birthdate location gender interestedIn interests"
    );
    if (!currentUser) return res.status(404).json({ message: "Usuario no encontrado" });
    const updates = {};

    if (avatar !== undefined || profilePhotos !== undefined) {
      const normalizedPhotoState = normalizeProfilePhotos(req, profilePhotos, avatar, currentUser);
      updates.avatar = normalizedPhotoState.avatar;
      updates.profilePhotos = normalizedPhotoState.profilePhotos;
    }
    if (gender !== undefined && ALLOWED_GENDERS.includes(gender)) updates.gender = gender === "" ? null : gender;
    if (birthdate !== undefined) updates.birthdate = birthdate ? new Date(birthdate) : null;
    if (Array.isArray(interests)) updates.interests = interests.slice(0, MAX_INTERESTS);
    if (location !== undefined) updates.location = location.trim();
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
    if (discoveryPreferences !== undefined) {
      const parsedDiscoveryPreferences = parseDiscoveryPreferencesInput(discoveryPreferences);
      if (parsedDiscoveryPreferences) updates.discoveryPreferences = parsedDiscoveryPreferences;
    }

    // Determine whether the merged profile state meets minimum requirements
    // and only mark onboardingComplete: true when it does.
    const mergedUser = { ...currentUser.toObject(), ...updates };
    const profileCompletion = getMinProfileCompletion(mergedUser);
    updates.onboardingComplete = profileCompletion.complete;

    const user = await User.findByIdAndUpdate(currentUser._id, updates, { new: true }).select("-password");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    const payload = user.toObject();
    const photoFields = serializeUserPhotoFields(req, payload);
    payload.avatar = photoFields.avatar;
    payload.profilePhotos = photoFields.profilePhotos;
    payload.profileCompletion = getMinProfileCompletion(payload);
    res.json(payload);
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
    const currentUser = await User.findById(req.userId).select("avatar profilePhotos");
    if (!currentUser) return res.status(404).json({ message: "Usuario no encontrado" });
    const normalizedPhotoState = normalizeProfilePhotos(req, undefined, avatar, currentUser);
    const user = await User.findByIdAndUpdate(
      req.userId,
      { avatar: normalizedPhotoState.avatar, profilePhotos: normalizedPhotoState.profilePhotos },
      { new: true }
    ).select("-password");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    const payload = user.toObject();
    const photoFields = serializeUserPhotoFields(req, payload);
    payload.avatar = photoFields.avatar;
    payload.profilePhotos = photoFields.profilePhotos;
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
      "interests intent gender interestedIn discoveryPreferences"
    );
    const myInterests = me?.interests || [];
    const myIntent = me?.intent || "";
    const discoveryFilters = buildDiscoveryMatch(me);

    const now = new Date();

    // Boosted users (active boost) appear first, then newest first.
    // Exclude all staff roles from public discovery
    const users = await User.aggregate([
      {
        $match: {
          _id: { $ne: new mongoose.Types.ObjectId(req.userId) },
          isBlocked: false,
          onboardingComplete: true,
          role: { $nin: STAFF_ROLES },
          ...discoveryFilters,
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
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          username: 1, name: 1, avatar: 1, bio: 1, gender: 1,
          profilePhotos: 1, photos: 1, profileImage: 1, photo: 1,
          interests: 1, intent: 1, location: 1, role: 1,
          creatorProfile: 1, birthdate: 1,
          followersCount: 1, isVerified: 1, isPremium: 1,
          isBoosted: { $gt: ["$crushBoostUntil", now] },
        },
      },
    ]);

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
router.post("/me/avatar-upload", userLimiter, verifyToken, (req, res, next) => {
  upload.single("avatar")(req, res, (err) => {
    if (err) {
      return sendUploadError(res, err, "Error al subir la imagen");
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, code: "FILE_REQUIRED", message: "No se recibió ningún archivo" });
    }
    const avatarPath = `/uploads/${req.file.filename}`;
    const avatarUrl = toAbsoluteUploadUrl(req, avatarPath);
    const shouldSetAsMain = parseSetAsMainParam(req.query);
    const user = await User.findById(req.userId).select("-password");
    if (!user) {
      return res.status(404).json({
        ok: false,
        code: "USER_NOT_FOUND",
        message: "Usuario no encontrado",
      });
    }
    const candidateProfilePhotos = [avatarUrl, ...(Array.isArray(user.profilePhotos) ? user.profilePhotos : [])];
    const normalizedPhotoState = normalizeProfilePhotos(
      req,
      candidateProfilePhotos,
      shouldSetAsMain ? avatarUrl : undefined,
      user
    );
    const nextAvatar = normalizedPhotoState.avatar;
    const nextProfilePhotos = normalizedPhotoState.profilePhotos;

    user.avatar = nextAvatar;
    user.profilePhotos = nextProfilePhotos;
    await user.save();

    const photoFields = serializeUserPhotoFields(req, user.toObject());
    res.json({
      ok: true,
      code: "UPLOAD_SUCCESS",
      message: "Imagen subida correctamente",
      avatar: photoFields.avatar,
      avatarPath,
      photo: avatarUrl,
      mainPhoto: photoFields.avatar,
      profilePhotos: photoFields.profilePhotos,
      maxExtraPhotos: photoFields.maxExtraPhotos,
      user: { ...user.toObject(), avatar: photoFields.avatar, profilePhotos: photoFields.profilePhotos },
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      code: "UPLOAD_FAILED",
      message: "No se pudo procesar la subida de la imagen",
    });
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
