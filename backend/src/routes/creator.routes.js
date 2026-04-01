const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const { getEarnings } = require("../controllers/creator.controller.js");

const router = Router();

const creatorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

router.get("/earnings", creatorLimiter, verifyToken, getEarnings);

module.exports = router;
