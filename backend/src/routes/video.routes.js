const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const { canWatchVideo } = require("../controllers/video.controller.js");

const router = Router();

const videoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

router.get("/:videoId/access", videoLimiter, verifyToken, canWatchVideo);

module.exports = router;
