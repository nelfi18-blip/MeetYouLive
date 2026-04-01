const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { getPackages, getTransactions } = require("../controllers/coins.controller.js");
const { verifyToken } = require("../middlewares/auth.middleware.js");

const router = Router();

const coinsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

router.get("/packages", getPackages);
router.get("/transactions", coinsLimiter, verifyToken, getTransactions);

module.exports = router;
