const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken, optionalVerifyToken } = require("../middlewares/auth.middleware.js");
const {
  startLive, endLive, getLives, getLiveById, joinLive, getMyLives, updateLiveSettings,
  getLiveGoal, setLiveGoal, getLiveBattle, startLiveBattle, endLiveBattle,
  triggerLiveEvent, stopLiveEvent, getActiveLiveEvent,
  requestJoinLive, approveGuest, declineGuest, leaveAsGuest, removeGuest, getGuests,
  startVsBattle,
} = require("../controllers/live.controller.js");

const router = Router();

const liveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

router.get("/", liveLimiter, getLives);
router.post("/start", liveLimiter, verifyToken, startLive);
router.get("/mine", liveLimiter, verifyToken, getMyLives);
router.get("/:id", liveLimiter, optionalVerifyToken, getLiveById);
router.post("/:id/join", liveLimiter, verifyToken, joinLive);
router.patch("/:id/end", liveLimiter, verifyToken, endLive);
router.patch("/:id/settings", liveLimiter, verifyToken, updateLiveSettings);

// Goal endpoints
router.get("/:id/goal", liveLimiter, getLiveGoal);
router.post("/:id/goal", liveLimiter, verifyToken, setLiveGoal);

// Battle endpoints
router.get("/:id/battle", liveLimiter, getLiveBattle);
router.post("/:id/battle/start", liveLimiter, verifyToken, startLiveBattle);
router.post("/:id/battle/end", liveLimiter, verifyToken, endLiveBattle);

// Live event endpoints
router.get("/:id/event", liveLimiter, getActiveLiveEvent);
router.post("/:id/event", liveLimiter, verifyToken, triggerLiveEvent);
router.delete("/:id/event", liveLimiter, verifyToken, stopLiveEvent);

// Multi-guest endpoints (Tango-style)
router.post("/:id/request-join", liveLimiter, verifyToken, requestJoinLive);
router.post("/:id/approve-guest", liveLimiter, verifyToken, approveGuest);
router.post("/:id/decline-guest", liveLimiter, verifyToken, declineGuest);
router.delete("/:id/leave-guest", liveLimiter, verifyToken, leaveAsGuest);
router.delete("/:id/remove-guest/:guestUserId", liveLimiter, verifyToken, removeGuest);
router.get("/:id/guests", liveLimiter, optionalVerifyToken, getGuests);

// VS Battle endpoints
router.post("/:id/start-vs", liveLimiter, verifyToken, startVsBattle);

module.exports = router;
