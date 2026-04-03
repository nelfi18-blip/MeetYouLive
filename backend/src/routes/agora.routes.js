const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middlewares/auth.middleware.js");
const { getToken } = require("../controllers/agora.controller.js");

// GET /api/agora/token?channelName=<name>&role=publisher|subscriber
router.get("/token", verifyToken, getToken);

module.exports = router;
