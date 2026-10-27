const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const { validate, coinPurchaseSchema, googlePlayCoinsPurchaseSchema, sparkPurchaseSchema } = require("../middlewares/validate.middleware.js");
const { createCheckoutSession, createCoinCheckoutSession, createSparkCheckoutSession } = require("../controllers/payment.controller.js");
const { verifyCoinsPurchase } = require("../controllers/googlePlayPurchase.controller.js");
const { canWatchVideo } = require("../controllers/video.controller.js");

const router = Router();

const paymentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 payment attempts per minute
  message: { message: "Demasiadas solicitudes de pago, intenta de nuevo más tarde" },
});

router.post("/checkout/:videoId", paymentLimiter, verifyToken, createCheckoutSession);
router.post("/coins", paymentLimiter, verifyToken, validate(coinPurchaseSchema), createCoinCheckoutSession);
// Android-only: validates a Google Play Billing purchase (purchaseToken) via
// the Google Play Developer API and credits Coins only after that
// server-side validation succeeds. See googlePlayPurchase.controller.js.
router.post(
  "/coins/google-play",
  paymentLimiter,
  verifyToken,
  validate(googlePlayCoinsPurchaseSchema),
  verifyCoinsPurchase
);
router.post("/sparks", paymentLimiter, verifyToken, validate(sparkPurchaseSchema), createSparkCheckoutSession);
router.get("/access/:videoId", paymentLimiter, verifyToken, canWatchVideo);

module.exports = router;
