 copilot/implement-real-video-streaming
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

router.get("/token", agoraLimiter, verifyToken, getToken);

const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middlewares/auth.middleware.js");
const { getToken } = require("../controllers/agora.controller.js");

// GET /api/agora/token?channelName=<name>&role=publisher|subscriber
router.get("/token", verifyToken, getToken); main

module.exports = router;
