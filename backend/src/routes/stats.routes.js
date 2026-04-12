const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const Live = require("../models/Live.js");
const Like = require("../models/Like.js");
const User = require("../models/User.js");
const { getOnlineUsers } = require("../lib/socket.js");

const router = Router();

const statsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

/**
 * GET /api/stats/activity
 * Public endpoint — returns live activity counters for social proof UI.
 */
router.get("/activity", statsLimiter, async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const [activeLivesCount, likesToday, boostActiveCount] = await Promise.all([
      Live.countDocuments({ isLive: true }),
      Like.countDocuments({ createdAt: { $gte: startOfDay } }),
      User.countDocuments({ crushBoostUntil: { $gt: now } }),
    ]);

    const onlineCount = getOnlineUsers().length;

    res.json({
      onlineCount,
      activeLivesCount,
      likesToday,
      boostActiveCount,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
