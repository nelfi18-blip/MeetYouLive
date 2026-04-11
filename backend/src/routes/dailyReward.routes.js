const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { getDailyRewardStatus, claimDailyReward } = require("../controllers/dailyReward.controller.js");
const { verifyToken } = require("../middlewares/auth.middleware.js");

const router = Router();

const statusLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

const claimLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 3,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

router.get("/status", statusLimiter, verifyToken, getDailyRewardStatus);
router.post("/claim", claimLimiter, verifyToken, claimDailyReward);

module.exports = router;
