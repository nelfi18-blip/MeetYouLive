const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const { getToken } = require("../controllers/agora.controller.js");

const router = Router();

const agoraLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Demasiadas solicitudes, intenta más tarde",
});

// GET /api/agora/token?channelName=<name>&role=publisher|subscriber
router.get("/token", agoraLimiter, verifyToken, getToken);

module.exports = router;
