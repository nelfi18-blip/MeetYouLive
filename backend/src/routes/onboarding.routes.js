const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const { updateOnboarding } = require("../controllers/onboarding.controller.js");

const router = Router();

const onboardingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

router.put("/", verifyToken, onboardingLimiter, updateOnboarding);

module.exports = router;
