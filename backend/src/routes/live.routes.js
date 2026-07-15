const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken, optionalVerifyToken, blockAdminSocialAccess } = require("../middlewares/auth.middleware.js");
const {
  startLive, endLive, getLives, getLiveById, joinLive, getMyLives, updateLiveSettings,
  getLiveGoal, setLiveGoal, getLiveBattle, startLiveBattle, endLiveBattle,
  triggerLiveEvent, stopLiveEvent, getActiveLiveEvent,
  requestJoinLive, approveGuest, declineGuest, leaveAsGuest, removeGuest, getGuests,
  moderateLiveUser,
  startVsBattle,
} = require("../controllers/live.controller.js");

const router = Router();

const liveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

router.get("/", liveLimiter, getLives);
router.post("/start", liveLimiter, verifyToken, blockAdminSocialAccess, startLive);
router.get("/mine", liveLimiter, verifyToken, blockAdminSocialAccess, getMyLives);
router.get("/:id", liveLimiter, optionalVerifyToken, getLiveById);
router.post("/:id/join", liveLimiter, verifyToken, blockAdminSocialAccess, joinLive);
router.patch("/:id/end", liveLimiter, verifyToken, blockAdminSocialAccess, endLive);
router.patch("/:id/settings", liveLimiter, verifyToken, blockAdminSocialAccess, updateLiveSettings);

// Goal endpoints
router.get("/:id/goal", liveLimiter, getLiveGoal);
router.post("/:id/goal", liveLimiter, verifyToken, blockAdminSocialAccess, setLiveGoal);

// Battle endpoints
router.get("/:id/battle", liveLimiter, getLiveBattle);
router.post("/:id/battle/start", liveLimiter, verifyToken, blockAdminSocialAccess, startLiveBattle);
router.post("/:id/battle/end", liveLimiter, verifyToken, blockAdminSocialAccess, endLiveBattle);

// Live event endpoints
router.get("/:id/event", liveLimiter, getActiveLiveEvent);
router.post("/:id/event", liveLimiter, verifyToken, blockAdminSocialAccess, triggerLiveEvent);
router.delete("/:id/event", liveLimiter, verifyToken, blockAdminSocialAccess, stopLiveEvent);

// Multi-guest endpoints (Tango-style)
router.post("/:id/request-join", liveLimiter, verifyToken, blockAdminSocialAccess, requestJoinLive);
router.post("/:id/approve-guest", liveLimiter, verifyToken, blockAdminSocialAccess, approveGuest);
router.post("/:id/decline-guest", liveLimiter, verifyToken, blockAdminSocialAccess, declineGuest);
router.delete("/:id/leave-guest", liveLimiter, verifyToken, blockAdminSocialAccess, leaveAsGuest);
router.delete("/:id/remove-guest/:guestUserId", liveLimiter, verifyToken, blockAdminSocialAccess, removeGuest);
router.get("/:id/guests", liveLimiter, optionalVerifyToken, getGuests);
router.post("/:id/moderation/:action", liveLimiter, verifyToken, moderateLiveUser);

// VS Battle endpoints
router.post("/:id/start-vs", liveLimiter, verifyToken, blockAdminSocialAccess, startVsBattle);

module.exports = router;
