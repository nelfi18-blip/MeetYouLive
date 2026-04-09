const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const {
  likeUser,
  unlikeUser,
  getMatches,
  checkMatch,
  superCrushUser,
  getCrushStats,
  getCrushConfig,
  boostCrush,
  unlockSwipes,
  getBoostStatus,
} = require("../controllers/match.controller.js");

const router = Router();

const matchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

// Super Crush has its own stricter limiter (coin-gated action)
const superCrushLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: { message: "Demasiados Super Crushes enviados, intenta de nuevo más tarde" },
});

router.post("/like/:userId",         matchLimiter,      verifyToken, likeUser);
router.delete("/like/:userId",       matchLimiter,      verifyToken, unlikeUser);
router.post("/super-crush/:userId",  superCrushLimiter, verifyToken, superCrushUser);
router.get("/",                      matchLimiter,      verifyToken, getMatches);
router.get("/config",                matchLimiter,      verifyToken, getCrushConfig);
router.get("/stats",                 matchLimiter,      verifyToken, getCrushStats);
router.get("/check/:userId",         matchLimiter,      verifyToken, checkMatch);
router.post("/boost",                matchLimiter,      verifyToken, boostCrush);
router.post("/unlock-swipes",        matchLimiter,      verifyToken, unlockSwipes);
router.get("/boost-status",          matchLimiter,      verifyToken, getBoostStatus);

module.exports = router;
