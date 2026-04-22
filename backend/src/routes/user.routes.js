const { Router } = require("express");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const upload = require("../middlewares/upload.middleware.js");
const User = require("../models/User.js");
const Live = require("../models/Live.js");
const { calculateCompatibility } = require("../services/compatibility.service.js");
const { getOnlineUsers } = require("../lib/socket.js");

const router = Router();

const userLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

const sendUploadError = (res, err, fallbackMessage = "Error al subir la imagen") => {
  if (!err) return;

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

// Public profile — returns safe fields for a given user/creator
router.get("/:id/public", userLimiter, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select(
      "username name avatar bio role creatorStatus isVerifiedCreator creatorProfile interests location"
    );
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    const profile = user.toObject();
    const activeLive = await Live.findOne({ user: user._id, isLive: true }).select("_id");
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
    res.json(user);
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
    const { username, name, bio, avatar, preferredLanguage, intent } = req.body;
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
    if (avatar !== undefined) updates.avatar = avatar.trim();
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

    if (updates.username) {
      const existing = await User.findOne({ username: updates.username, _id: { $ne: req.userId } });
      if (existing) {
        return res.status(400).json({ message: "Este nombre de usuario ya está en uso" });
      }
    }

    const user = await User.findByIdAndUpdate(req.userId, updates, { new: true }).select("-password");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json(user);
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

// Maximum number of interests a user can have (must match frontend limit)
const MAX_INTERESTS = 10;

router.patch("/me/onboarding", userLimiter, verifyToken, async (req, res) => {
  try {
    const { avatar, gender, birthdate, interests, location, name, bio, intent } = req.body;
    const updates = { onboardingComplete: true };

    if (avatar !== undefined) updates.avatar = avatar.trim();
    if (gender !== undefined) updates.gender = gender;
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

    const user = await User.findByIdAndUpdate(req.userId, updates, { new: true }).select("-password");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json(user);
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
    const user = await User.findByIdAndUpdate(
      req.userId,
      { avatar: avatar.trim() },
      { new: true }
    ).select("-password");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json(user);
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
    const me = await User.findById(req.userId).select("interests intent");
    const myInterests = me?.interests || [];
    const myIntent = me?.intent || "";

    const now = new Date();

    // Boosted users (active boost) appear first, then newest first.
    const users = await User.aggregate([
      {
        $match: {
          _id: { $ne: new mongoose.Types.ObjectId(req.userId) },
          isBlocked: false,
          onboardingComplete: true,
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
    const avatarUrl = `/uploads/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(
      req.userId,
      { avatar: avatarUrl },
      { new: true }
    ).select("-password");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json({ ok: true, avatar: avatarUrl, user });
  } catch (err) {
    res.status(500).json({
      ok: false,
      code: "UPLOAD_FAILED",
      message: "No se pudo procesar la subida de la imagen",
    });
  }
});

// Submit verification photo — users send a selfie for admin review
router.post("/me/verification-photo", userLimiter, verifyToken, (req, res, next) => {
  upload.single("verificationPhoto")(req, res, (err) => {
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
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    if (user.verificationStatus === "approved") {
      return res.status(400).json({ message: "Tu cuenta ya está verificada" });
    }
    if (user.verificationStatus === "pending") {
      return res.status(400).json({ message: "Ya tienes una solicitud de verificación pendiente" });
    }
    const photoUrl = `/uploads/${req.file.filename}`;
    user.verificationPhoto = photoUrl;
    user.verificationStatus = "pending";
    await user.save();
    res.json({
      ok: true,
      message: "Foto de verificación enviada. Un administrador la revisará pronto.",
      verificationStatus: user.verificationStatus,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      code: "UPLOAD_FAILED",
      message: "No se pudo procesar la subida de la imagen",
    });
  }
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

module.exports = router;
