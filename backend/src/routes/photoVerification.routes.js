const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const {
  startSession,
  completeSession,
  getStatus,
} = require("../controllers/photoVerification.controller.js");

const router = Router();

// Strict limiter: selfie-liveness verification is sensitive and expensive
// (AWS Rekognition calls); this blocks rapid repeated attempts/abuse on top
// of the service-level per-user retry/active-session checks.
const photoVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, code: "RATE_LIMITED", message: "Demasiados intentos, intenta más tarde." },
});

router.get("/status", photoVerificationLimiter, verifyToken, getStatus);
router.post("/start", photoVerificationLimiter, verifyToken, startSession);
router.post("/:sessionId/complete", photoVerificationLimiter, verifyToken, completeSession);

module.exports = router;
