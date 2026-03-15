const { Router } = require("express");
const passport = require("passport");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");

const router = Router();

const googleConfigured =
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET &&
  process.env.GOOGLE_CALLBACK_URL;

const googleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

router.get("/google", googleLimiter, (req, res, next) => {
  if (!googleConfigured) {
    return res.status(503).json({ message: "Google OAuth no está configurado" });
  }
  passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});

router.get("/google/callback", googleLimiter, (req, res, next) => {
  if (!googleConfigured) {
    return res.status(503).json({ message: "Google OAuth no está configurado" });
  }
  passport.authenticate("google", { session: false }, (err, user) => {
    if (err || !user) {
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=google`);
    }
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "JWT_SECRET not configured" });
    }
    try {
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
        expiresIn: "7d",
      });
      res.redirect(`${process.env.FRONTEND_URL}/auth/success?token=${token}`);
    } catch {
      res.status(500).json({ message: "Error generating token" });
    }
  })(req, res, next);
});

module.exports = router;
