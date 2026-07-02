const Chat = require("../models/Chat.js");
const Message = require("../models/Message.js");
const User = require("../models/User.js");
const { trackEvent } = require("../services/missions.service.js");
const { withSerializedUserPhotoFields } = require("../lib/photoFields.js");
const { emitChatMessage } = require("../lib/socket.js");

// Define staff roles that should be excluded from regular user chats
const STAFF_ROLES = ["admin", "moderator", "support", "creator_manager", "finance", "content_reviewer"];
// Query every legacy photo alias so serializer can promote the first real photo.
const CHAT_USER_FIELDS = "username name avatar profilePhotos profileImage photo role";

const getChats = async (req, res) => {
  try {
    const chats = await Chat.find({ participants: req.userId })
      .populate("participants", CHAT_USER_FIELDS)
      .populate("lastMessage")
      .sort({ updatedAt: -1 });

    // Filter out chats where any participant is a staff member
    const filteredChats = chats.filter((chat) => {
      // Check if any participant has a staff role
      // Ensure participant is populated (not just an ObjectId) before checking role
      const hasStaffMember = chat.participants.some((p) => 
        p && typeof p === 'object' && p.role && STAFF_ROLES.includes(p.role)
      );
      return !hasStaffMember;
    });

    const result = filteredChats.map((chat) => ({
      _id: chat._id,
      participants: chat.participants.map((participant) => withSerializedUserPhotoFields(req, participant)),
      lastMessage: chat.lastMessage,
      currentUserId: req.userId,
      updatedAt: chat.updatedAt,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getChatById = async (req, res) => {
  try {
    const chat = await Chat.findOne({
      _id: req.params.chatId,
      participants: req.userId,
    }).populate("participants", CHAT_USER_FIELDS);
    if (!chat) return res.status(404).json({ message: "Chat no encontrado" });
    const payload = chat.toObject();
    payload.participants = payload.participants.map((participant) =>
      withSerializedUserPhotoFields(req, participant)
    );
    res.json(payload);
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
    // Check if recipient is a staff member
    const recipient = await User.findById(recipientId).select("role");
    if (!recipient) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    if (STAFF_ROLES.includes(recipient.role)) {
      return res.status(403).json({ message: "No puedes iniciar un chat con personal administrativo" });
    }

    let chat = await Chat.findOne({
      participants: { $all: [req.userId, recipientId], $size: 2 },
    })
      .populate("participants", CHAT_USER_FIELDS)
      .populate("lastMessage");

    if (!chat) {
      chat = await Chat.create({ participants: [req.userId, recipientId] });
      chat = await Chat.findById(chat._id)
        .populate("participants", CHAT_USER_FIELDS)
        .populate("lastMessage");
    }

    const payload = chat.toObject();
    payload.participants = payload.participants.map((participant) =>
      withSerializedUserPhotoFields(req, participant)
    );
    res.json(payload);
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

    const query = { chat: req.params.chatId };
    const afterMessageId = req.query.after || req.query.afterMessageId || req.query.lastMessageId;
    if (afterMessageId && /^[a-f0-9]{24}$/i.test(String(afterMessageId))) {
      const afterMessage = await Message.findOne({ _id: afterMessageId, chat: req.params.chatId })
        .select("createdAt")
        .lean();
      if (afterMessage) {
        query.createdAt = { $gt: afterMessage.createdAt };
      }
    }

    const messages = await Message.find(query)
      .populate("sender", CHAT_USER_FIELDS)
      .sort({ createdAt: 1 })
      .limit(100); // Returns the most recent 100 messages; paginate with skip/limit if needed

    res.json(messages.map((message) => {
      const payload = message.toObject();
      payload.sender = withSerializedUserPhotoFields(req, payload.sender);
      return payload;
    }));
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

    const populated = await Message.findById(message._id).populate("sender", CHAT_USER_FIELDS);
    const payload = populated.toObject();
    payload.sender = withSerializedUserPhotoFields(req, payload.sender);
    res.status(201).json(payload);

    emitChatMessage({
      chatId: req.params.chatId,
      message: payload,
      senderId: req.userId,
      participants: chat.participants,
    }).catch((err) => {
      console.error("[emitChatMessage]", err);
    });

    // Track chat mission progress (fire-and-forget)
    trackEvent(req.userId, "message").catch(() => {});
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getChats, getChatById, createOrGetChat, getMessages, sendMessage };
