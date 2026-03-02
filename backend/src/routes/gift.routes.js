const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const { sendGift, getReceivedGifts } = require("../controllers/gift.controller.js");

const router = Router();

const giftLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

router.post("/", giftLimiter, verifyToken, sendGift);
router.get("/received", giftLimiter, verifyToken, getReceivedGifts);

module.exports = router;
