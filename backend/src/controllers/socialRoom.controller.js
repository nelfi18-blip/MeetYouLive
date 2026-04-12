const SocialRoom = require("../models/SocialRoom.js");
const SocialRoomMessage = require("../models/SocialRoomMessage.js");
const User = require("../models/User.js");
const { getIO } = require("../lib/socket.js");

/* ── Default rooms seeded per category ─────────────────────────────────── */
const DEFAULT_ROOMS = [
  {
    category: "confianza_amor",
    title: "💖 Confianza en el amor",
    description: "Un espacio para hablar sobre autoestima, miedos y crecer en confianza para el amor.",
  },
  {
    category: "rompe_hielo",
    title: "🔥 Rompe el hielo",
    description: "Practica conversaciones, aprende a iniciar y supera la timidez.",
  },
  {
    category: "consejos_citas",
    title: "💬 Consejos de citas",
    description: "Comparte y recibe consejos reales sobre citas, primeras impresiones y conexiones.",
  },
  {
    category: "mala_suerte_amor",
    title: "😅 Mala suerte en el amor",
    description: "Para reír, desahogarse y apoyarse con las historias más curiosas del amor.",
  },
];

/**
 * Ensure at least one active room exists per category.
 * Called before listing rooms so the app bootstraps automatically.
 */
const seedDefaultRooms = async () => {
  for (const def of DEFAULT_ROOMS) {
    const exists = await SocialRoom.findOne({ category: def.category, isActive: true });
    if (!exists) {
      await SocialRoom.create(def);
    }
  }
};

/* ── List all active rooms (grouped by category) ───────────────────────── */
const listRooms = async (req, res) => {
  try {
    await seedDefaultRooms();
    const rooms = await SocialRoom.find({ isActive: true })
      .populate("host", "username name avatar")
      .sort({ category: 1, createdAt: 1 })
      .lean();
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ── Get a single room ──────────────────────────────────────────────────── */
const getRoom = async (req, res) => {
  try {
    const room = await SocialRoom.findOne({ _id: req.params.id, isActive: true })
      .populate("host", "username name avatar")
      .populate("moderators", "username name avatar")
      .populate("highlightedUsers", "username name avatar")
      .lean();
    if (!room) return res.status(404).json({ message: "Sala no encontrada" });
    res.json(room);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ── Get recent messages for a room ────────────────────────────────────── */
const getMessages = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const before = req.query.before; // ISO timestamp for pagination

    const query = { room: req.params.id };
    if (before) query.createdAt = { $lt: new Date(before) };

    const messages = await SocialRoomMessage.find(query)
      .populate("sender", "username name avatar")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ── Post a message ─────────────────────────────────────────────────────── */
const postMessage = async (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ message: "text es requerido" });
  }
  const sanitized = text.trim().slice(0, 500);

  try {
    const room = await SocialRoom.findOne({ _id: req.params.id, isActive: true });
    if (!room) return res.status(404).json({ message: "Sala no encontrada" });

    const sender = await User.findById(req.userId).select("username name avatar").lean();
    if (!sender) return res.status(401).json({ message: "Usuario no encontrado" });

    const msg = await SocialRoomMessage.create({
      room: room._id,
      sender: req.userId,
      text: sanitized,
    });

    await SocialRoom.findByIdAndUpdate(room._id, { $inc: { messageCount: 1 } });

    const msgObj = {
      _id: String(msg._id),
      room: String(room._id),
      sender: { _id: String(sender._id), username: sender.username, name: sender.name, avatar: sender.avatar },
      text: sanitized,
      isHighlighted: false,
      createdAt: msg.createdAt,
      isHost: room.host ? String(room.host) === String(req.userId) : false,
      isModerator: room.moderators.some((m) => String(m) === String(req.userId)),
    };

    const io = getIO();
    if (io) {
      io.to(`social_room:${room._id}`).emit("ROOM_MESSAGE", msgObj);
    }

    res.status(201).json(msgObj);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ── Highlight a user in the room (host/mod only) ──────────────────────── */
const highlightUser = async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ message: "userId es requerido" });

  try {
    const room = await SocialRoom.findOne({ _id: req.params.id, isActive: true });
    if (!room) return res.status(404).json({ message: "Sala no encontrada" });

    const isHost = room.host && String(room.host) === String(req.userId);
    const isMod = room.moderators.some((m) => String(m) === String(req.userId));
    if (!isHost && !isMod) {
      return res.status(403).json({ message: "Solo el host o moderadores pueden destacar usuarios" });
    }

    await SocialRoom.findByIdAndUpdate(room._id, { $addToSet: { highlightedUsers: userId } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { listRooms, getRoom, getMessages, postMessage, highlightUser };
