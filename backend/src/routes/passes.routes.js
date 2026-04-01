const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { getCatalog, getMyPasses, purchasePass } = require("../controllers/passes.controller.js");
const { verifyToken } = require("../middlewares/auth.middleware.js");

const router = Router();

const passesLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

router.get("/catalog", getCatalog);
router.get("/my", passesLimiter, verifyToken, getMyPasses);
router.post("/purchase", passesLimiter, verifyToken, purchasePass);

module.exports = router;
