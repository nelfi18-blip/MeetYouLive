const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const {
  startSession,
  completeSession,
  getStatus,
  getReferenceStatus,
  deleteReference,
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

// Separate, looser limiter for the reference status/delete endpoints — these
// never call AWS Rekognition and are expected to be checked more often (e.g.
// account/privacy settings pages).
const faceReferenceLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, code: "RATE_LIMITED", message: "Demasiados intentos, intenta más tarde." },
});

router.get("/status", photoVerificationLimiter, verifyToken, getStatus);
router.post("/start", photoVerificationLimiter, verifyToken, startSession);
router.post("/:sessionId/complete", photoVerificationLimiter, verifyToken, completeSession);

// "Perfil Auténtico" reusable face reference — same system, separate
// consent: view status, or explicitly delete the kept reference at any time.
router.get("/reference", faceReferenceLimiter, verifyToken, getReferenceStatus);
router.delete("/reference", faceReferenceLimiter, verifyToken, deleteReference);

module.exports = router;
