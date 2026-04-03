const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken, optionalVerifyToken } = require("../middlewares/auth.middleware.js");
const { startLive, endLive, getLives, getLiveById, joinLive, getMyLives, updateLiveSettings } = require("../controllers/live.controller.js");

const router = Router();

const liveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

router.get("/", liveLimiter, getLives);
router.post("/start", liveLimiter, verifyToken, startLive);
router.get("/mine", liveLimiter, verifyToken, getMyLives);
router.get("/:id", liveLimiter, optionalVerifyToken, getLiveById);
router.post("/:id/join", liveLimiter, verifyToken, joinLive);
router.patch("/:id/end", liveLimiter, verifyToken, endLive);
router.patch("/:id/settings", liveLimiter, verifyToken, updateLiveSettings);

module.exports = router;
