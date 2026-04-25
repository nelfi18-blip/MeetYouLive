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
  getPayoutHistory,
} = require("../controllers/creator.controller");

const creatorLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// Creator request endpoints (any authenticated user)
router.post("/request", creatorLimiter, verifyToken, submitCreatorRequest);
router.get("/request-status", creatorLimiter, verifyToken, getCreatorRequestStatus);

// Approved-creator-only endpoints
router.get("/dashboard", creatorLimiter, verifyToken, requireApprovedCreator, getCreatorDashboard);
router.get("/stats", creatorLimiter, verifyToken, requireApprovedCreator, getCreatorStats);
router.get("/earnings", creatorLimiter, verifyToken, requireApprovedCreator, getCreatorEarnings);
router.post("/payout", creatorLimiter, verifyToken, requireApprovedCreator, requestPayout);
router.get("/payout-history", creatorLimiter, verifyToken, requireApprovedCreator, getPayoutHistory);

module.exports = router;
