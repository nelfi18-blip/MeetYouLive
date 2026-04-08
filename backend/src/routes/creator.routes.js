const express = require("express");
const rateLimit = require("express-rate-limit");

const router = express.Router();

const { verifyToken } = require("../middlewares/auth.middleware");
const { requireApprovedCreator } = require("../middlewares/creator.middleware");
const {
  getCreatorStats,
  getCreatorEarnings,
  requestPayout,
  getCreatorDashboard,
  submitCreatorRequest,
  getCreatorRequestStatus,
} = require("../controllers/creator.controller");

const creatorLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// Creator request endpoints (any authenticated user)
router.post("/request", verifyToken, creatorLimiter, submitCreatorRequest);
router.get("/request-status", verifyToken, creatorLimiter, getCreatorRequestStatus);

// Approved-creator-only endpoints
router.get("/dashboard", verifyToken, requireApprovedCreator, creatorLimiter, getCreatorDashboard);
router.get("/stats", verifyToken, requireApprovedCreator, creatorLimiter, getCreatorStats);
router.get("/earnings", verifyToken, requireApprovedCreator, creatorLimiter, getCreatorEarnings);
router.post("/payout", verifyToken, requireApprovedCreator, creatorLimiter, requestPayout);

module.exports = router;
