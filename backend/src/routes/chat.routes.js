const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const Chat = require("../models/Chat.js");

const router = Router();

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

router.get("/", chatLimiter, verifyToken, async (req, res) => {
  try {
    const chats = await Chat.find({ participants: req.userId })
      .populate("participants", "username name")
      .sort({ updatedAt: -1 });

    const result = chats.map((chat) => ({
      ...chat.toObject(),
      currentUserId: req.userId,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: "Error al obtener los chats" });
  }
});

module.exports = router;
