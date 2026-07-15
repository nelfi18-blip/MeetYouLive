const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken, blockAdminSocialAccess } = require("../middlewares/auth.middleware.js");
const { requireAdmin } = require("../middlewares/admin.middleware.js");
const { validate, giftSendSchema } = require("../middlewares/validate.middleware.js");
const { fraudCheck } = require("../middlewares/fraud.middleware.js");
const {
  sendGift,
  getReceivedGifts,
  getGiftCatalog,
  getProfileGiftStats,
  getTopSupporters,
  adminGetCatalog,
  adminCreateCatalogItem,
  adminUpdateCatalogItem,
  adminDeleteCatalogItem,
} = require("../controllers/gift.controller.js");

const router = Router();

const giftLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 gifts per minute is reasonable for active users
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

router.get("/", getGiftCatalog);
router.post("/", giftLimiter, verifyToken, blockAdminSocialAccess, fraudCheck({ checkSelfGift: true, checkNewAccount: true }), validate(giftSendSchema), sendGift);
router.post("/send", giftLimiter, verifyToken, blockAdminSocialAccess, fraudCheck({ checkSelfGift: true, checkNewAccount: true }), validate(giftSendSchema), sendGift);
router.get("/received", giftLimiter, verifyToken, blockAdminSocialAccess, getReceivedGifts);

// Profile gift stats and top supporters
router.get("/profile-stats/:userId", getProfileGiftStats);
router.get("/top-supporters/:userId", getTopSupporters);

// Admin: gift catalog management
router.get("/catalog", giftLimiter, verifyToken, requireAdmin, adminGetCatalog);
router.post("/catalog", giftLimiter, verifyToken, requireAdmin, adminCreateCatalogItem);
router.patch("/catalog/:id", giftLimiter, verifyToken, requireAdmin, adminUpdateCatalogItem);
router.delete("/catalog/:id", giftLimiter, verifyToken, requireAdmin, adminDeleteCatalogItem);

module.exports = router;
