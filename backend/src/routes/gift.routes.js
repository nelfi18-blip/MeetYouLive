const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const { requireAdmin } = require("../middlewares/admin.middleware.js");
const {
  sendGift,
  getReceivedGifts,
  getGiftCatalog,
  adminGetCatalog,
  adminCreateCatalogItem,
  adminUpdateCatalogItem,
  adminDeleteCatalogItem,
} = require("../controllers/gift.controller.js");

const router = Router();

const giftLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

router.get("/", getGiftCatalog);
router.post("/", giftLimiter, verifyToken, sendGift);
router.get("/received", giftLimiter, verifyToken, getReceivedGifts);

// Admin: gift catalog management
router.get("/catalog", verifyToken, requireAdmin, adminGetCatalog);
router.post("/catalog", verifyToken, requireAdmin, adminCreateCatalogItem);
router.patch("/catalog/:id", verifyToken, requireAdmin, adminUpdateCatalogItem);
router.delete("/catalog/:id", verifyToken, requireAdmin, adminDeleteCatalogItem);

module.exports = router;
