const express = require("express");
const rateLimit = require("express-rate-limit");
const { optionalVerifyToken } = require("../middlewares/auth.middleware.js");
const { createAnalyticsEvent } = require("../controllers/analytics.controller.js");

const router = express.Router();

const analyticsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Demasiadas solicitudes de analítica" },
});

router.use(express.json({ limit: "4kb" }));
router.post("/events", analyticsLimiter, optionalVerifyToken, createAnalyticsEvent);

module.exports = router;
