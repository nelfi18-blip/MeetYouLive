const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken, blockAdminSocialAccess } = require("../middlewares/auth.middleware.js");
const {
  inviteCall,
  getIncoming,
  getCallHistory,
  getCallById,
  respondCall,
  endCall,
  submitOffer,
  submitAnswer,
  addCandidates,
  getCandidates,
  tickCall,
} = require("../controllers/videoCall.controller.js");

const router = Router();

const callLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

router.post("/", callLimiter, verifyToken, blockAdminSocialAccess, inviteCall);
router.get("/incoming", callLimiter, verifyToken, blockAdminSocialAccess, getIncoming);
router.get("/history", callLimiter, verifyToken, blockAdminSocialAccess, getCallHistory);
router.get("/:id", callLimiter, verifyToken, blockAdminSocialAccess, getCallById);
router.patch("/:id/respond", callLimiter, verifyToken, blockAdminSocialAccess, respondCall);
router.patch("/:id/end", callLimiter, verifyToken, blockAdminSocialAccess, endCall);
router.post("/:id/tick", callLimiter, verifyToken, blockAdminSocialAccess, tickCall);
router.put("/:id/offer", callLimiter, verifyToken, blockAdminSocialAccess, submitOffer);
router.put("/:id/answer", callLimiter, verifyToken, blockAdminSocialAccess, submitAnswer);
router.post("/:id/candidates", callLimiter, verifyToken, blockAdminSocialAccess, addCandidates);
router.get("/:id/candidates", callLimiter, verifyToken, blockAdminSocialAccess, getCandidates);

module.exports = router;
