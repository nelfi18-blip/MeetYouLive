const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { getPackages, getBalance, getTransactions, useBoost } = require("../controllers/sparks.controller.js");
const { verifyToken } = require("../middlewares/auth.middleware.js");

const router = Router();

const sparksLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

const boostLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

router.get("/packages", getPackages);
router.get("/balance", sparksLimiter, verifyToken, getBalance);
router.get("/transactions", sparksLimiter, verifyToken, getTransactions);
router.post("/boost", boostLimiter, verifyToken, useBoost);

module.exports = router;
