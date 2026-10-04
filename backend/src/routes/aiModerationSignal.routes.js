const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const { requirePermission } = require("../middlewares/admin.middleware.js");
const {
  listAIModerationSignals, updateAIModerationSignalStatus,
} = require("../controllers/aiModerationSignal.controller.js");

const router = Router();

// Same shape as moderation.routes.js's existing limiter: coherent with the
// rest of the moderation surface, not a new rate-limit strategy.
const aiModerationSignalsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

// Staff-only: list AI moderation signals pending human review (or filtered
// by ?status=reviewed|dismissed|pending). Reuses the existing VIEW_REPORTS
// style permission set (admin, moderator, content_reviewer) — no new role
// system is introduced.
router.get(
  "/ai-signals",
  aiModerationSignalsLimiter,
  verifyToken,
  requirePermission("VIEW_AI_SIGNALS"),
  listAIModerationSignals
);

// Staff-only: mark a signal reviewed/dismissed. This never bans, suspends,
// blocks or deletes anything; it only records that a human looked at it.
router.patch(
  "/ai-signals/:id",
  aiModerationSignalsLimiter,
  verifyToken,
  requirePermission("REVIEW_AI_SIGNALS"),
  updateAIModerationSignalStatus
);

module.exports = router;
