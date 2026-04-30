const User = require("../models/User.js");

/**
 * Middleware that rejects requests from users who are not approved creators or subCreators.
 * Must be used after verifyToken so that req.userId is set.
 */
const requireApprovedCreator = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select("role creatorStatus");
    if (!user) {
      return res
        .status(403)
        .json({ ok: false, message: "Acceso restringido a creadores aprobados." });
    }
    
    // Allow both creator and subCreator roles
    const isCreator = user.role === "creator" && user.creatorStatus === "approved";
    const isSubCreator = user.role === "subCreator" && user.creatorStatus === "approved";
    
    if (!isCreator && !isSubCreator) {
      return res
        .status(403)
        .json({ ok: false, message: "Acceso restringido a creadores aprobados." });
    }
    next();
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Error de servidor" });
  }
};

/**
 * Middleware that rejects requests from subCreators (only allows full creators).
 * Must be used after verifyToken so that req.userId is set.
 */
const requireFullCreator = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select("role creatorStatus");
    if (!user || user.role !== "creator" || user.creatorStatus !== "approved") {
      return res
        .status(403)
        .json({ ok: false, message: "Solo los creadores de nivel 1 pueden realizar esta acción." });
    }
    next();
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Error de servidor" });
  }
};

module.exports = { requireApprovedCreator, requireFullCreator };
