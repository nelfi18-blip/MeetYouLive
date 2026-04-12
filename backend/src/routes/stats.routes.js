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

// Server-side cache to avoid hammering the DB on every request
const CACHE_TTL_MS = 20_000; // 20 seconds
let _cachedStats = null;
let _cacheExpiry = 0;

/**
 * GET /api/stats/activity
 * Public endpoint — returns live activity counters for social proof UI.
 * Results are cached server-side for 20 seconds.
 */
router.get("/activity", statsLimiter, async (req, res) => {
  try {
    const now = Date.now();
    if (_cachedStats && now < _cacheExpiry) {
      return res.json(_cachedStats);
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const nowDate = new Date();

    const [activeLivesCount, likesToday, boostActiveCount] = await Promise.all([
      Live.countDocuments({ isLive: true }),
      Like.countDocuments({ createdAt: { $gte: startOfDay } }),
      User.countDocuments({ crushBoostUntil: { $gt: nowDate } }),
    ]);

    const onlineCount = getOnlineUsers().length;

    _cachedStats = { onlineCount, activeLivesCount, likesToday, boostActiveCount };
    _cacheExpiry = now + CACHE_TTL_MS;

    res.json(_cachedStats);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
