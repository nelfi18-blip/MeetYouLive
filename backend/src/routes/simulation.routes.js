const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken, optionalVerifyToken } = require("../middlewares/auth.middleware.js");
const {
  getScenarios,
  getResponses,
  postResponse,
  likeResponse,
  unlockScenario,
} = require("../controllers/simulation.controller.js");

const router = Router();

const responseLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { message: "Demasiadas respuestas, espera un momento" },
});

// Scenarios list — optionally attaches userId for unlock status
router.get("/scenarios", optionalVerifyToken, getScenarios);

// Community responses for a scenario — optionally attaches userId for likedByMe
router.get("/scenarios/:scenarioId/responses", optionalVerifyToken, getResponses);

// Post a practice response
router.post("/scenarios/:scenarioId/responses", responseLimiter, verifyToken, postResponse);

// Like / unlike a response
router.post("/responses/:id/like", verifyToken, likeResponse);

// Unlock a premium scenario with coins
router.post("/scenarios/:scenarioId/unlock", verifyToken, unlockScenario);

module.exports = router;
