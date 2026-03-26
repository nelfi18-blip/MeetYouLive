const { Router } = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const { requireAdmin } = require("../middlewares/admin.middleware.js");
const User = require("../models/User.js");
const Video = require("../models/Video.js");
const Live = require("../models/Live.js");
const { getOverview, getUsers, getReports, makeAdmin, getCreatorRequests, approveCreator, rejectCreator } = require("../controllers/admin.controller.js");

const router = Router();

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Demasiados intentos de acceso, intenta de nuevo más tarde" },
});

/**
 * Constant-time string comparison to prevent timing attacks.
 * Always compares same-length buffers to avoid leaking length information.
 */
function timingSafeStringEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const maxLen = Math.max(Buffer.byteLength(a, "utf8"), Buffer.byteLength(b, "utf8"));
  const bufA = Buffer.alloc(maxLen);
  const bufB = Buffer.alloc(maxLen);
  bufA.write(a, "utf8");
  bufB.write(b, "utf8");
  return crypto.timingSafeEqual(bufA, bufB);
}

// Public admin login — validates against ADMIN_USER/ADMIN_PASS env vars
router.post("/login", adminLoginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "username y password son requeridos" });
    }

    const adminUser = process.env.ADMIN_USER || "";
    const adminPass = process.env.ADMIN_PASS || "";

    const credentialsValid =
      timingSafeStringEqual(username, adminUser) &&
      timingSafeStringEqual(password, adminPass);

    if (!credentialsValid) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    // Find the admin user in the database to obtain a valid user ID for the JWT.
    // The database user's username must match ADMIN_USER and have the admin role.
    const user = await User.findOne({ username, role: "admin" });
    if (!user) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.json({
      token,
      user: { id: user._id, username: user.username, role: user.role },
    });
  } catch (error) {
    res.status(500).json({ message: "Error servidor" });
  }
});

// All routes below require a valid JWT and admin role
router.use(adminLimiter, verifyToken, requireAdmin);

router.get("/overview", getOverview);
router.get("/users", getUsers);
router.get("/reports", getReports);
router.patch("/make-admin", makeAdmin);
router.get("/creator-requests", getCreatorRequests);
router.patch("/creator-requests/:id/approve", approveCreator);
router.patch("/creator-requests/:id/reject", rejectCreator);

router.patch("/users/:id/role", async (req, res) => {
  const { role } = req.body;
  if (!["user", "creator_pending", "creator", "admin"].includes(role)) {
    return res.status(400).json({ message: "Rol inválido" });
  }
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select("-password");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch("/users/:id/block", async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBlocked: true },
      { new: true }
    ).select("-password");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json({ message: "Usuario bloqueado", user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch("/users/:id/unblock", async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBlocked: false },
      { new: true }
    ).select("-password");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json({ message: "Usuario desbloqueado", user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/videos/:id", async (req, res) => {
  try {
    const video = await Video.findByIdAndDelete(req.params.id);
    if (!video) return res.status(404).json({ message: "Vídeo no encontrado" });
    res.json({ message: "Vídeo eliminado" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/lives/:id", async (req, res) => {
  try {
    const live = await Live.findByIdAndUpdate(
      req.params.id,
      { isLive: false, endedAt: new Date() },
      { new: true }
    );
    if (!live) return res.status(404).json({ message: "Live no encontrado" });
    res.json({ message: "Live terminado por admin", live });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
