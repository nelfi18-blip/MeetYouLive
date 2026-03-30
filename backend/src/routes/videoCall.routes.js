const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const {
  inviteCall,
  getIncoming,
  getCallById,
  respondCall,
  endCall,
  submitOffer,
  submitAnswer,
  addCandidates,
  getCandidates,
} = require("../controllers/videoCall.controller.js");

const router = Router();

const callLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

router.post("/", callLimiter, verifyToken, inviteCall);
router.get("/incoming", callLimiter, verifyToken, getIncoming);
router.get("/:id", callLimiter, verifyToken, getCallById);
router.patch("/:id/respond", callLimiter, verifyToken, respondCall);
router.patch("/:id/end", callLimiter, verifyToken, endCall);
router.put("/:id/offer", callLimiter, verifyToken, submitOffer);
router.put("/:id/answer", callLimiter, verifyToken, submitAnswer);
router.post("/:id/candidates", callLimiter, verifyToken, addCandidates);
router.get("/:id/candidates", callLimiter, verifyToken, getCandidates);

module.exports = router;
