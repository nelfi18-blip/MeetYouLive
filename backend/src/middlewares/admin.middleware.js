const User = require("../models/User.js");

const requireAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select("role");
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Acceso denegado: se requiere rol admin" });
    }
    next();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Middleware that allows both admin and moderator roles.
 * Moderators can handle moderation tasks but not financial operations.
 * Must be used after verifyToken so that req.userId is set.
 */
const requireModeratorOrAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select("role");
    if (!user || (user.role !== "admin" && user.role !== "moderator")) {
      return res.status(403).json({ message: "Acceso denegado: se requiere rol moderador o admin" });
    }
    // Store role in request for downstream checks if needed
    req.userRole = user.role;
    next();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { requireAdmin, requireModeratorOrAdmin };
