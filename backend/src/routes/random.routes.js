const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken, blockAdminSocialAccess } = require("../middlewares/auth.middleware.js");
const { join, status, leave, next } = require("../controllers/random.controller.js");

const router = Router();

// Random 1:1 matchmaking is polled/triggered frequently by clients (join,
// status, next); keep a generous but bounded limiter consistent with other
// authenticated endpoints in the app.
const randomLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 20,
  message: { ok: false, message: "Demasiadas solicitudes, espera un momento" },
});

// GET /status is the authoritative fallback clients poll while waiting/in a
// session (independent of Socket.io), so it needs a higher ceiling than the
// state-changing actions.
const statusLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 60,
  message: { ok: false, message: "Demasiadas solicitudes, espera un momento" },
});

router.post("/join", randomLimiter, verifyToken, blockAdminSocialAccess, join);
router.get("/status", statusLimiter, verifyToken, blockAdminSocialAccess, status);
router.post("/leave", randomLimiter, verifyToken, blockAdminSocialAccess, leave);
router.post("/next", randomLimiter, verifyToken, blockAdminSocialAccess, next);

module.exports = router;
