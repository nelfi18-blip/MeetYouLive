const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const { getChats, createOrGetChat, getMessages, sendMessage } = require("../controllers/chat.controller.js");

const router = Router();

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

router.get("/", chatLimiter, verifyToken, getChats);
router.post("/", chatLimiter, verifyToken, createOrGetChat);
router.get("/:chatId/messages", chatLimiter, verifyToken, getMessages);
router.post("/:chatId/messages", chatLimiter, verifyToken, sendMessage);

module.exports = router;
