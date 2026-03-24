const { Router } = require("express");
const { getPackages } = require("../controllers/coins.controller.js");

const router = Router();

router.get("/packages", getPackages);

module.exports = router;
