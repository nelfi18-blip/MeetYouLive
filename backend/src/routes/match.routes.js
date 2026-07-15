const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken, blockAdminSocialAccess } = require("../middlewares/auth.middleware.js");
const {
  likeUser,
  unlikeUser,
  getMatches,
  checkMatch,
  superCrushUser,
  getCrushStats,
  getCrushConfig,
  boostCrush,
  purchaseBoostPack,
  unlockSwipes,
  getBoostStatus,
  getBoostActiveCount,
  getLikesReceived,
  unlockAllLikes,
} = require("../controllers/match.controller.js");

const router = Router();

const matchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

// Super Crush has its own stricter limiter (coin-gated action)
const superCrushLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: { success: false, message: "Demasiados Super Crushes enviados, intenta de nuevo más tarde" },
});

router.post("/like/:userId",         matchLimiter,      verifyToken, blockAdminSocialAccess, likeUser);
router.delete("/like/:userId",       matchLimiter,      verifyToken, blockAdminSocialAccess, unlikeUser);
router.post("/super-crush/:userId",  superCrushLimiter, verifyToken, blockAdminSocialAccess, superCrushUser);
router.get("/",                      matchLimiter,      verifyToken, blockAdminSocialAccess, getMatches);
router.get("/config",                matchLimiter,      verifyToken, blockAdminSocialAccess, getCrushConfig);
router.get("/stats",                 matchLimiter,      verifyToken, blockAdminSocialAccess, getCrushStats);
router.get("/check/:userId",         matchLimiter,      verifyToken, blockAdminSocialAccess, checkMatch);
router.post("/boost",                matchLimiter,      verifyToken, blockAdminSocialAccess, boostCrush);
router.post("/boost-pack",           matchLimiter,      verifyToken, blockAdminSocialAccess, purchaseBoostPack);
router.post("/unlock-swipes",        matchLimiter,      verifyToken, blockAdminSocialAccess, unlockSwipes);
router.get("/boost-status",          matchLimiter,      verifyToken, blockAdminSocialAccess, getBoostStatus);
router.get("/boost-active-count",    matchLimiter,      verifyToken, blockAdminSocialAccess, getBoostActiveCount);
router.get("/likes-received",        matchLimiter,      verifyToken, blockAdminSocialAccess, getLikesReceived);
router.post("/unlock-likes",         matchLimiter,      verifyToken, blockAdminSocialAccess, unlockAllLikes);

module.exports = router;
