const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken, optionalVerifyToken } = require("../middlewares/auth.middleware.js");
const {
  startLive, endLive, getLives, getLiveById, joinLive, getMyLives, updateLiveSettings,
  getLiveGoal, setLiveGoal, getLiveBattle, startLiveBattle, endLiveBattle,
} = require("../controllers/live.controller.js");

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

// Goal endpoints
router.get("/:id/goal", liveLimiter, getLiveGoal);
router.post("/:id/goal", liveLimiter, verifyToken, setLiveGoal);

// Battle endpoints
router.get("/:id/battle", liveLimiter, getLiveBattle);
router.post("/:id/battle/start", liveLimiter, verifyToken, startLiveBattle);
router.post("/:id/battle/end", liveLimiter, verifyToken, endLiveBattle);

module.exports = router;
