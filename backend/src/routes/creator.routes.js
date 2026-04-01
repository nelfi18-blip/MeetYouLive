const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const User = require("../models/User.js");
const { getEarnings } = require("../controllers/creator.controller.js");

const router = Router();

const creatorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

const requireApprovedCreator = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select("role creatorStatus");
    if (!user || user.role !== "creator" || user.creatorStatus !== "approved") {
      return res.status(403).json({ message: "Solo los creadores aprobados pueden acceder a este recurso" });
    }
    next();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

router.get("/earnings", creatorLimiter, verifyToken, requireApprovedCreator, getEarnings);

module.exports = router;
