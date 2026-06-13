const { Router } = require("express");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const { updateOnboarding } = require("../controllers/onboarding.controller.js");

const router = Router();

router.put("/", verifyToken, updateOnboarding);

module.exports = router;
