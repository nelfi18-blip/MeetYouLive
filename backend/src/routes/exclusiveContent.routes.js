const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken, optionalVerifyToken } = require("../middlewares/auth.middleware.js");
const {
  listContent,
  myContent,
  createContent,
  getContent,
  unlockContent,
  checkAccess,
} = require("../controllers/exclusiveContent.controller.js");

const router = Router();

const exclusiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

router.get("/", exclusiveLimiter, listContent);
router.post("/", exclusiveLimiter, verifyToken, createContent);
router.get("/mine", exclusiveLimiter, verifyToken, myContent);
router.get("/:id", exclusiveLimiter, optionalVerifyToken, getContent);
router.post("/:id/unlock", exclusiveLimiter, verifyToken, unlockContent);
router.get("/:id/access", exclusiveLimiter, verifyToken, checkAccess);

module.exports = router;
