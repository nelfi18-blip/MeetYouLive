const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const { getCreatorsForDiscovery } = require("../controllers/creatorDiscovery.controller");

const discoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

// Public endpoint for creator discovery
router.get("/discovery", discoveryLimiter, getCreatorsForDiscovery);

module.exports = router;
