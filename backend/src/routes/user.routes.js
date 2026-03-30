const { Router } = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const User = require("../models/User.js");

const router = Router();

const userLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
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
    const user = await User.findById(req.userId).select("coins earningsCoins");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json({ coins: user.coins, earningsCoins: user.earningsCoins });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch("/me", userLimiter, verifyToken, async (req, res) => {
  try {
    const { username, name, bio, avatar } = req.body;
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
      "username name avatar bio gender interests location role"
    )
      // Sort newest first so recently joined users appear at the top.
      // Future improvement: weight by shared interests or location.
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({ users, page, limit });
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

    user.creatorRequest = true;
    user.role = "creator_pending";
    await user.save();

    res.json({ message: "Solicitud enviada correctamente. Un administrador la revisará pronto.", user: { role: user.role, creatorRequest: user.creatorRequest } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
