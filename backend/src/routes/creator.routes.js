const express = require("express");
const rateLimit = require("express-rate-limit");
 copilot/clean-creator-earnings-implementation
const { verifyToken } = require("../middlewares/auth.middleware.js");
const { getEarnings, requestPayout } = require("../controllers/creator.controller.js");

const router = express.Router();
 main

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

 copilot/clean-creator-earnings-implementation
router.get("/earnings", creatorLimiter, verifyToken, getEarnings);
router.post("/payout", creatorLimiter, verifyToken, requestPayout);

router.get("/stats", verifyToken, creatorLimiter, getCreatorStats);
router.get("/earnings", verifyToken, creatorLimiter, getCreatorEarnings);
router.post("/payout", verifyToken, creatorLimiter, requestPayout);
 main

module.exports = router;
