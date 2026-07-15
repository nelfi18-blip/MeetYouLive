const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken, optionalVerifyToken, blockAdminSocialAccess } = require("../middlewares/auth.middleware.js");
const {
  getFeed,
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

// Simple feed endpoint - public access with optional token
router.get("/",            feedLimiter, optionalVerifyToken, blockAdminSocialAccess, getFeed);

// Feed endpoints
router.get("/hybrid",      feedLimiter, verifyToken, blockAdminSocialAccess, getHybridFeed);
router.get("/live-only",   feedLimiter, verifyToken, blockAdminSocialAccess, getLiveOnlyFeed);
router.get("/match-only",  feedLimiter, verifyToken, blockAdminSocialAccess, getMatchOnlyFeed);
router.get("/top",         feedLimiter, verifyToken, blockAdminSocialAccess, getTopFeed);

// Hook system endpoints
router.post("/track-visit",    feedLimiter, verifyToken, blockAdminSocialAccess, trackProfileVisit);
router.get("/visits",          feedLimiter, verifyToken, blockAdminSocialAccess, getRecentVisits);
router.post("/send-greeting",  feedLimiter, verifyToken, blockAdminSocialAccess, sendGreeting);
router.get("/greetings",       feedLimiter, verifyToken, blockAdminSocialAccess, getReceivedGreetings);

module.exports = router;
