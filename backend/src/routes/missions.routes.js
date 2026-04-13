const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { getTodayMissions } = require("../controllers/missions.controller.js");
const { verifyToken } = require("../middlewares/auth.middleware.js");

const router = Router();

const missionsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

router.get("/today", missionsLimiter, verifyToken, getTodayMissions);

module.exports = router;
