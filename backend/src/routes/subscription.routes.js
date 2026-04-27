const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const {
  createSubscriptionSession,
  createTierSubscriptionSession,
  getVipTiers,
  getSubscriptionStatus,
  cancelSubscription,
} = require("../controllers/subscription.controller.js");

const router = Router();

const subLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

router.get("/tiers", getVipTiers);
router.post("/checkout", subLimiter, verifyToken, createSubscriptionSession);
router.post("/subscribe-tier", subLimiter, verifyToken, createTierSubscriptionSession);
router.get("/status", subLimiter, verifyToken, getSubscriptionStatus);
router.delete("/cancel", subLimiter, verifyToken, cancelSubscription);

module.exports = router;
