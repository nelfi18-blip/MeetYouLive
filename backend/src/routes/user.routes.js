const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const User = require("../models/User.js");

const router = Router();

const MIN_USERNAME_LENGTH = 2;

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
  const { username, name } = req.body;
  const updates = {};
  if (username !== undefined) {
    if (typeof username !== "string" || username.trim().length < MIN_USERNAME_LENGTH) {
      return res.status(400).json({ message: `username debe tener al menos ${MIN_USERNAME_LENGTH} caracteres` });
    }
    updates.username = username.trim();
  }
  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length < 1) {
      return res.status(400).json({ message: "name no puede estar vacío" });
    }
    updates.name = name.trim();
  }
  try {
    const user = await User.findByIdAndUpdate(req.userId, updates, {
      new: true,
      runValidators: true,
    }).select("-password");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json(user);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "Ese nombre de usuario ya está en uso" });
    }
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
