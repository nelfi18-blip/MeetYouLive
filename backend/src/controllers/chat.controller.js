const Chat = require("../models/Chat.js");
const Message = require("../models/Message.js");

const getChats = async (req, res) => {
  try {
    const chats = await Chat.find({ participants: req.userId })
      .populate("participants", "username name")
      .populate("lastMessage")
      .sort({ updatedAt: -1 });

    const result = chats.map((chat) => ({
      _id: chat._id,
      participants: chat.participants,
      lastMessage: chat.lastMessage,
      currentUserId: req.userId,
      updatedAt: chat.updatedAt,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createOrGetChat = async (req, res) => {
  const { recipientId } = req.body;
  if (!recipientId) {
    return res.status(400).json({ message: "recipientId es requerido" });
  }
  if (recipientId === String(req.userId)) {
    return res.status(400).json({ message: "No puedes crear un chat contigo mismo" });
  }
  try {
    let chat = await Chat.findOne({
      participants: { $all: [req.userId, recipientId], $size: 2 },
    })
      .populate("participants", "username name")
      .populate("lastMessage");

    if (!chat) {
      chat = await Chat.create({ participants: [req.userId, recipientId] });
      chat = await Chat.findById(chat._id)
        .populate("participants", "username name")
        .populate("lastMessage");
    }

    res.json(chat);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getMessages = async (req, res) => {
  try {
    const chat = await Chat.findOne({
      _id: req.params.chatId,
      participants: req.userId,
    });
    if (!chat) return res.status(404).json({ message: "Chat no encontrado" });

    const messages = await Message.find({ chat: req.params.chatId })
      .populate("sender", "username name")
      .sort({ createdAt: 1 })
      .limit(100); // Returns the most recent 100 messages; paginate with skip/limit if needed

    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const sendMessage = async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ message: "text es requerido" });
  }
  try {
    const chat = await Chat.findOne({
      _id: req.params.chatId,
      participants: req.userId,
    });
    if (!chat) return res.status(404).json({ message: "Chat no encontrado" });

    const message = await Message.create({
      chat: req.params.chatId,
      sender: req.userId,
      text: text.trim(),
    });

    await Chat.findByIdAndUpdate(req.params.chatId, {
      lastMessage: message._id,
      updatedAt: new Date(),
    });

    const populated = await Message.findById(message._id).populate("sender", "username name");
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getChats, createOrGetChat, getMessages, sendMessage };
