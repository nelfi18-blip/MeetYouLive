const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
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

router.post("/join", randomLimiter, verifyToken, join);
router.get("/status", verifyToken, status);
router.post("/leave", randomLimiter, verifyToken, leave);
router.post("/next", randomLimiter, verifyToken, next);

module.exports = router;
