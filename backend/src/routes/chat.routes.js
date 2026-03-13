const { Router } = require("express");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const Chat = require("../models/Chat.js");

const router = Router();

// GET /api/chats — list chats for the authenticated user
router.get("/", verifyToken, async (req, res) => {
  try {
    const chats = await Chat.find({ participants: req.userId })
      .populate("participants", "username name avatar")
      .sort({ updatedAt: -1 });

    const result = chats.map((chat) => ({
      _id: chat._id,
      participants: chat.participants,
      currentUserId: req.userId,
      lastMessage: chat.lastMessage || null,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/chats/:id — get a single chat with messages
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const chat = await Chat.findOne({
      _id: req.params.id,
      participants: req.userId,
    }).populate("participants", "username name avatar");

    if (!chat) {
      return res.status(404).json({ message: "Chat no encontrado" });
    }

    res.json(chat);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/chats/:id/messages — send a message in a chat
router.post("/:id/messages", verifyToken, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ message: "El mensaje no puede estar vacío" });
    }

    const chat = await Chat.findOne({
      _id: req.params.id,
      participants: req.userId,
    });

    if (!chat) {
      return res.status(404).json({ message: "Chat no encontrado" });
    }

    const message = { sender: req.userId, text: text.trim() };
    chat.messages.push(message);
    chat.lastMessage = { text: text.trim(), createdAt: new Date() };
    await chat.save();

    res.status(201).json(chat.messages[chat.messages.length - 1]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
