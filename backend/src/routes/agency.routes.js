const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const {
  getInviteInfo,
  getMyAgency,
  getSubCreators,
  inviteSubCreator,
  updateSubCreatorPercentage,
  removeSubCreator,
  getMyRelationship,
  acceptRelationship,
  declineRelationship,
} = require("../controllers/agency.controller.js");

const router = Router();

const agencyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

// Write operations have stricter limits
const agencyWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

// Public route — no auth required, used to display invite banner on register/creator-request pages
router.get("/invite-info", agencyLimiter, getInviteInfo);

router.use(agencyLimiter, verifyToken);

// Agency-creator routes
router.get("/me", agencyLimiter, getMyAgency);
router.get("/sub-creators", agencyLimiter, getSubCreators);
// /link is the canonical endpoint; /invite kept for backward compatibility
router.post("/link", agencyWriteLimiter, inviteSubCreator);
router.post("/invite", agencyWriteLimiter, inviteSubCreator);
router.patch("/sub-creators/:id/percentage", agencyWriteLimiter, updateSubCreatorPercentage);
router.patch("/sub-creators/:id/remove", agencyWriteLimiter, removeSubCreator);

// Sub-creator route — any creator can view their own agency relationship
router.get("/my-relationship", agencyLimiter, getMyRelationship);
router.patch("/my-relationship/accept", agencyWriteLimiter, acceptRelationship);
router.patch("/my-relationship/decline", agencyWriteLimiter, declineRelationship);

module.exports = router;
