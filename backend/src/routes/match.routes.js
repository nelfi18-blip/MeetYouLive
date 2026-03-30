const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const { likeUser, unlikeUser, getMatches, checkMatch } = require("../controllers/match.controller.js");

const router = Router();

const matchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

router.post("/like/:userId",   matchLimiter, verifyToken, likeUser);
router.delete("/like/:userId", matchLimiter, verifyToken, unlikeUser);
router.get("/",                matchLimiter, verifyToken, getMatches);
router.get("/check/:userId",   matchLimiter, verifyToken, checkMatch);

module.exports = router;
