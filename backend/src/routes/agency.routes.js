const { Router } = require("express");
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

router.use(verifyToken);

// Agency-creator routes
router.get("/me", getMyAgency);
router.get("/sub-creators", getSubCreators);
router.post("/invite", inviteSubCreator);
router.patch("/sub-creators/:id/percentage", updateSubCreatorPercentage);
router.patch("/sub-creators/:id/remove", removeSubCreator);

// Sub-creator route — any creator can view their own agency relationship
router.get("/my-relationship", getMyRelationship);

module.exports = router;
