const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const { createCheckoutSession } = require("../controllers/payment.controller.js");
const { canWatchVideo } = require("../controllers/video.controller.js");

const router = Router();

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

router.post("/checkout/:videoId", paymentLimiter, verifyToken, createCheckoutSession);
router.get("/access/:videoId", paymentLimiter, verifyToken, canWatchVideo);

module.exports = router;
