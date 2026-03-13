const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const {
  getChats,
  getChat,
  getOrCreateChat,
  getMessages,
  sendMessage,
} = require("../controllers/chat.controller.js");

const router = Router();

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

router.get("/", chatLimiter, verifyToken, getChats);
router.post("/", chatLimiter, verifyToken, getOrCreateChat);
router.get("/:id", chatLimiter, verifyToken, getChat);
router.get("/:id/messages", chatLimiter, verifyToken, getMessages);
router.post("/:id/messages", chatLimiter, verifyToken, sendMessage);

module.exports = router;
