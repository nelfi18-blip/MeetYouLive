const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();

const { verifyToken } = require("../middlewares/auth.middleware");
const {
  getCreatorStats,
  getCreatorEarnings,
  requestPayout,
} = require("../controllers/creator.controller");

const creatorLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get("/stats", verifyToken, creatorLimiter, getCreatorStats);
router.get("/earnings", verifyToken, creatorLimiter, getCreatorEarnings);
router.post("/payout", verifyToken, creatorLimiter, requestPayout);

module.exports = router;
