const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const {
  getMyAgency,
  getSubCreators,
  inviteSubCreator,
  updateSubCreatorPercentage,
  removeSubCreator,
  getMyRelationship,
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

router.use(agencyLimiter, verifyToken);

// Agency-creator routes
router.get("/me", agencyLimiter, getMyAgency);
router.get("/sub-creators", agencyLimiter, getSubCreators);
router.post("/invite", agencyWriteLimiter, inviteSubCreator);
router.patch("/sub-creators/:id/percentage", agencyWriteLimiter, updateSubCreatorPercentage);
router.patch("/sub-creators/:id/remove", agencyWriteLimiter, removeSubCreator);

// Sub-creator route — any creator can view their own agency relationship
router.get("/my-relationship", agencyLimiter, getMyRelationship);

module.exports = router;
