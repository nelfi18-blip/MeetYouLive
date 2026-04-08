const User = require("../models/User.js");

/**
 * Middleware that rejects requests from users who are not approved creators.
 * Must be used after verifyToken so that req.userId is set.
 */
const requireApprovedCreator = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select("role creatorStatus");
    if (!user || user.role !== "creator" || user.creatorStatus !== "approved") {
      return res
        .status(403)
        .json({ ok: false, message: "Acceso restringido a creadores aprobados." });
    }
    next();
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Error de servidor" });
  }
};

module.exports = { requireApprovedCreator };
