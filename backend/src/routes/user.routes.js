const { Router } = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const upload = require("../middlewares/upload.middleware.js");
const User = require("../models/User.js");
const Live = require("../models/Live.js");
const CoinTransaction = require("../models/CoinTransaction.js");

const router = Router();

const userLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

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
    const { username, name, bio, avatar, preferredLanguage } = req.body;
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
    const { avatar, gender, birthdate, interests, location, name, bio } = req.body;
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

    const users = await User.find(
      {
        _id: { $ne: req.userId },
        isBlocked: false,
        onboardingComplete: true,
      },
      "username name avatar bio gender interests location role creatorProfile"
    )
      // Sort newest first so recently joined users appear at the top.
      // Future improvement: weight by shared interests or location.
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Enrich with live status for creator accounts
    const userIds = users.map((u) => u._id);
    const activeLives = await Live.find({ user: { $in: userIds }, isLive: true }).select("user _id");
    const liveByUser = {};
    activeLives.forEach((l) => { liveByUser[String(l.user)] = String(l._id); });

    const enriched = users.map((u) => {
      const obj = u.toObject();
      const liveId = liveByUser[String(u._id)] || null;
      obj.isLive = !!liveId;
      obj.liveId = liveId;
      return obj;
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
      return res.status(400).json({ message: err.message || "Error al subir la imagen" });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No se recibió ningún archivo" });
    }
    const avatarUrl = `/uploads/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(
      req.userId,
      { avatar: avatarUrl },
      { new: true }
    ).select("-password");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json({ avatar: avatarUrl, user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Submit verification photo — users send a selfie for admin review
router.post("/me/verification-photo", userLimiter, verifyToken, (req, res, next) => {
  upload.single("verificationPhoto")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || "Error al subir la imagen" });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No se recibió ningún archivo" });
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
    res.json({ message: "Foto de verificación enviada. Un administrador la revisará pronto.", verificationStatus: user.verificationStatus });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Daily reward — awards 10 coins once per calendar day (UTC)
router.post("/daily-reward", userLimiter, verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    const DAILY_COINS = 10;
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    if (user.lastDailyReward && user.lastDailyReward >= todayUTC) {
      return res.status(400).json({ message: "Ya reclamaste tu recompensa de hoy", alreadyClaimed: true });
    }

    user.coins += DAILY_COINS;
    user.lastDailyReward = now;
    await user.save();

    await CoinTransaction.create({
      userId: user._id,
      type: "daily_reward",
      amount: DAILY_COINS,
      reason: "Recompensa diaria",
    });

    res.json({ message: "¡Recompensa reclamada!", coins: user.coins, earned: DAILY_COINS, lastDailyReward: user.lastDailyReward });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
