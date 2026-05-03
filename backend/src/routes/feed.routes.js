const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const {
  getHybridFeed,
  getLiveOnlyFeed,
  getMatchOnlyFeed,
  getTopFeed,
  trackProfileVisit,
  getRecentVisits,
  sendGreeting,
  getReceivedGreetings,
} = require("../controllers/feed.controller.js");

const router = Router();

const feedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

// Feed endpoints
router.get("/hybrid",      feedLimiter, verifyToken, getHybridFeed);
router.get("/live-only",   feedLimiter, verifyToken, getLiveOnlyFeed);
router.get("/match-only",  feedLimiter, verifyToken, getMatchOnlyFeed);
router.get("/top",         feedLimiter, verifyToken, getTopFeed);

// Hook system endpoints
router.post("/track-visit",    feedLimiter, verifyToken, trackProfileVisit);
router.get("/visits",          feedLimiter, verifyToken, getRecentVisits);
router.post("/send-greeting",  feedLimiter, verifyToken, sendGreeting);
router.get("/greetings",       feedLimiter, verifyToken, getReceivedGreetings);

module.exports = router;
