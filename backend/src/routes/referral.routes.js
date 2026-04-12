const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { getMyReferral, claimReferral } = require("../controllers/referral.controller.js");
const { verifyToken } = require("../middlewares/auth.middleware.js");

const router = Router();

const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

const claimLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

router.get("/me", readLimiter, verifyToken, getMyReferral);
router.post("/claim", claimLimiter, verifyToken, claimReferral);

module.exports = router;
