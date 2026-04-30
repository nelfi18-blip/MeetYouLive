const express = require("express");
const rateLimit = require("express-rate-limit");

const router = express.Router();

const { verifyToken } = require("../middlewares/auth.middleware");
const { requireApprovedCreator, requireFullCreator } = require("../middlewares/creator.middleware");
const { validate, payoutRequestSchema } = require("../middlewares/validate.middleware");
const {
  getCreatorStats,
  getCreatorEarnings,
  requestPayout,
  getPayoutHistory,
  getCreatorDashboard,
  submitCreatorRequest,
  getCreatorRequestStatus,
  connectOnboarding,
  getConnectStatus,
  getCreatorInviteCode,
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

// Approved-creator-only endpoints (both creator and subCreator)
router.get("/dashboard", creatorLimiter, verifyToken, requireApprovedCreator, getCreatorDashboard);
router.get("/stats", creatorLimiter, verifyToken, requireApprovedCreator, getCreatorStats);
router.get("/earnings", creatorLimiter, verifyToken, requireApprovedCreator, getCreatorEarnings);
router.post("/payout", creatorLimiter, verifyToken, requireApprovedCreator, validate(payoutRequestSchema), requestPayout);
router.get("/payout-history", creatorLimiter, verifyToken, requireApprovedCreator, getPayoutHistory);

// Only full creators can generate invite codes (subCreators cannot)
router.get("/invite-code", creatorLimiter, verifyToken, requireFullCreator, getCreatorInviteCode);

// Stripe Connect
router.post("/payout/connect-onboarding", creatorLimiter, verifyToken, requireApprovedCreator, connectOnboarding);
router.get("/payout/connect-status", creatorLimiter, verifyToken, requireApprovedCreator, getConnectStatus);

module.exports = router;
