const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");

const { verifyToken } = require("../middlewares/auth.middleware");
const { requireApprovedCreator } = require("../middlewares/creator.middleware");
const { requireAdmin } = require("../middlewares/admin.middleware");
const {
  requestWithdrawal,
  listWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
} = require("../controllers/withdraw.controller");

const withdrawLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

// Creator endpoint
router.post("/request", withdrawLimiter, verifyToken, requireApprovedCreator, requestWithdrawal);

// Admin endpoints
router.get("/", withdrawLimiter, verifyToken, requireAdmin, listWithdrawals);
router.patch("/:id/approve", withdrawLimiter, verifyToken, requireAdmin, approveWithdrawal);
router.patch("/:id/reject", withdrawLimiter, verifyToken, requireAdmin, rejectWithdrawal);

module.exports = router;
