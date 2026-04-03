const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const { createCall, endCall } = require("../controllers/call.controller.js");

const router = Router();

const callLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

router.post("/", callLimiter, verifyToken, createCall);
router.patch("/:id/end", callLimiter, verifyToken, endCall);

module.exports = router;
