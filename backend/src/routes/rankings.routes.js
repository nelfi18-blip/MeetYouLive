const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware");
const {
  getLiveTopGifters,
  getTopCreators,
  getFeaturedCreators,
  getCreatorRankingStats,
} = require("../controllers/rankings.controller");

const rankingsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

// Public endpoints
router.get("/live/:id/top-gifters", rankingsLimiter, getLiveTopGifters);
router.get("/creators", rankingsLimiter, getTopCreators);
router.get("/featured", rankingsLimiter, getFeaturedCreators);

// Creator-only endpoint
router.get("/my-stats", rankingsLimiter, verifyToken, getCreatorRankingStats);

module.exports = router;
