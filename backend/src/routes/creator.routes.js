const { Router } = require("express");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const { getEarnings } = require("../controllers/creator.controller.js");

const router = Router();

router.get("/earnings", verifyToken, getEarnings);

module.exports = router;
