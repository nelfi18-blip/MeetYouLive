const Chat = require("../models/Chat.js");
const Message = require("../models/Message.js");
const User = require("../models/User.js");

const getChats = async (req, res) => {
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
    res.status(500).json({ message: err.message });
  }
};

const getOrCreateChat = async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ message: "userId es requerido" });
  if (userId === String(req.userId)) {
    return res.status(400).json({ message: "No puedes chatear contigo mismo" });
  }

  try {
    const otherUser = await User.findById(userId);
    if (!otherUser) return res.status(404).json({ message: "Usuario no encontrado" });

    let chat = await Chat.findOne({
      participants: { $all: [req.userId, userId], $size: 2 },
    }).populate("participants", "username name");

    if (!chat) {
      chat = await Chat.create({ participants: [req.userId, userId] });
      await chat.populate("participants", "username name");
    }

    res.json({ ...chat.toObject(), currentUserId: req.userId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getChat = async (req, res) => {
  try {
    const chat = await Chat.findOne({ _id: req.params.id, participants: req.userId })
      .populate("participants", "username name");
    if (!chat) return res.status(404).json({ message: "Chat no encontrado" });
    res.json({ ...chat.toObject(), currentUserId: req.userId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getMessages = async (req, res) => {
  const { id } = req.params;
  try {
    const chat = await Chat.findOne({ _id: id, participants: req.userId });
    if (!chat) return res.status(404).json({ message: "Chat no encontrado" });

    const messages = await Message.find({ chat: id })
      .populate("sender", "username name")
      .sort({ createdAt: 1 })
      .limit(100);

    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const sendMessage = async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ message: "text es requerido" });
  }

  try {
    const chat = await Chat.findOne({ _id: id, participants: req.userId });
    if (!chat) return res.status(404).json({ message: "Chat no encontrado" });

    const message = await Message.create({
      chat: id,
      sender: req.userId,
      text: text.trim(),
    });
    await message.populate("sender", "username name");

    await Chat.findByIdAndUpdate(id, {
      lastMessage: {
        text: message.text,
        sender: req.userId,
        createdAt: message.createdAt,
      },
      updatedAt: new Date(),
    });

    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getChats, getChat, getOrCreateChat, getMessages, sendMessage };
