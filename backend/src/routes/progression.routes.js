const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { getUserProgression } = require("../controllers/progression.controller.js");
const { verifyToken } = require("../middlewares/auth.middleware.js");

const router = Router();

const progressionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

router.get("/progression", progressionLimiter, verifyToken, getUserProgression);

module.exports = router;
