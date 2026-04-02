const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const { getCreatorStats, getCreatorEarnings, requestPayout } = require("../controllers/creator.controller.js");

const router = Router();

const creatorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

router.get("/stats", creatorLimiter, verifyToken, getCreatorStats);
router.get("/earnings", creatorLimiter, verifyToken, getCreatorEarnings);
router.post("/payout", creatorLimiter, verifyToken, requestPayout);

module.exports = router;
