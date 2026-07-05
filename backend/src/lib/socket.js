const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const Live = require("../models/Live.js");
const Chat = require("../models/Chat.js");
const Message = require("../models/Message.js");
const User = require("../models/User.js");
const VideoCall = require("../models/VideoCall.js");

let io = null;

// In-memory map of currently online users: userId (string) → { lastSeen: Date, socketIds: Set<string> }
const onlineUsers = new Map();

// Timeout for considering a user offline if no heartbeat received (5 minutes)
const ONLINE_TIMEOUT_MS = 5 * 60 * 1000;

// Cleanup interval ID to prevent multiple intervals and allow cleanup on shutdown
let cleanupIntervalId = null;

// In-memory map of live room viewers: liveId (string) → Set<socketId>
const liveViewers = new Map();
// In-memory map of active live hosts: liveId (string) → Set<socketId>
const liveHosts = new Map();

// In-memory map of active live events: liveId (string) → { type, label, icon, expiresAt, timerId }
const liveEvents = new Map();

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

const isObjectId = (value) => typeof value === "string" && OBJECT_ID_RE.test(value);

const getUserRoom = (userId) => `user:${userId}`;

const getHandshakeToken = (socket) => {
  const authToken = socket.handshake.auth && socket.handshake.auth.token;
  if (typeof authToken === "string" && authToken.trim()) return authToken.trim();

  const header = socket.handshake.headers && socket.handshake.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  return null;
};

const authenticateSocket = async (socket, next) => {
  const token = getHandshakeToken(socket);
  if (!token) return next();
  if (!process.env.JWT_SECRET) return next(new Error("Socket auth unavailable"));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || !isObjectId(String(decoded.id))) return next(new Error("Invalid socket token"));

    const user = await User.findById(decoded.id).select("isBlocked").lean();
    if (!user || user.isBlocked) return next(new Error("Invalid socket token"));

    socket._userId = String(decoded.id);
    socket.data.userId = String(decoded.id);
    User.updateOne({ _id: decoded.id }, { lastActiveAt: new Date() }).catch(() => {});
    return next();
  } catch (_) {
    return next(new Error("Invalid socket token"));
  }
};

const isChatParticipant = async (chatId, userId) => {
  if (!isObjectId(chatId) || !isObjectId(userId)) return false;
  const chat = await Chat.findOne({ _id: chatId, participants: userId }).select("_id").lean();
  return !!chat;
};

const isChatBetweenParticipants = async (chatId, userA, userB) => {
  if (!isObjectId(chatId) || !isObjectId(userA) || !isObjectId(userB)) return false;
  const chat = await Chat.findOne({ _id: chatId, participants: { $all: [userA, userB], $size: 2 } }).select("_id").lean();
  return !!chat;
};

const isCallBetweenParticipants = async (callId, userA, userB) => {
  if (!isObjectId(callId) || !isObjectId(userA) || !isObjectId(userB)) return false;
  const call = await VideoCall.findOne({
    _id: callId,
    $or: [
      { caller: userA, recipient: userB },
      { caller: userB, recipient: userA },
    ],
  }).select("_id").lean();
  return !!call;
};

const sanitizeHttpsUrl = (value) => {
  if (typeof value !== "string" || value.length > 500) return "";
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch (_) {
    return "";
  }
};

const sanitizeVisualGift = (gift = {}) => ({
  name: String(gift.name || "Regalo Premium").slice(0, 80),
  icon: String(gift.icon || "🎁").slice(0, 12),
  coinCost: Math.max(0, Math.min(100000, parseInt(gift.coinCost, 10) || 0)),
  rarity: String(gift.rarity || "common").slice(0, 24),
  category: String(gift.category || "emotional").slice(0, 24),
  type: ["basic", "premium", "super"].includes(gift.type) ? gift.type : "basic",
  isSuper: !!gift.isSuper || gift.type === "super",
  animationType: ["small", "medium", "fullscreen"].includes(gift.animationType) ? gift.animationType : "small",
  soundUrl: sanitizeHttpsUrl(gift.soundUrl),
});

const getParticipantIds = (chat) => (chat?.participants || []).map((id) => String(id));

const joinPersonalRoom = (socket) => {
  const userId = socket._userId;
  if (!userId) return false;
  socket.join(getUserRoom(userId));
  // Keep the legacy raw userId room for existing notification/live/call emitters.
  socket.join(userId);

  const existing = onlineUsers.get(userId);
  if (existing) {
    existing.socketIds.add(socket.id);
    existing.lastSeen = new Date();
  } else {
    onlineUsers.set(userId, { lastSeen: new Date(), socketIds: new Set([socket.id]) });
    if (io) io.emit("USER_ONLINE", { userId });
  }
  return true;
};

const serializeMessage = (message) => {
  if (!message) return null;
  return typeof message.toObject === "function" ? message.toObject() : message;
};

const emitChatMessage = async ({ chatId, message, senderId, participants }) => {
  if (!io || !chatId || !message) return;
  let participantIds = Array.isArray(participants) ? participants.map((id) => String(id)) : [];
  if (participantIds.length === 0) {
    const chat = await Chat.findById(chatId).select("participants").lean();
    if (!chat) return;
    participantIds = getParticipantIds(chat);
  }

  const payload = {
    chatId: String(chatId),
    message: serializeMessage(message),
    clientMessageId: message.clientMessageId || null,
  };

  io.to(`chat:${chatId}`).emit("message:new", payload);
  for (const participantId of participantIds) {
    const eventName = participantId === String(senderId) ? "message:sent" : "message:new";
    io.to(getUserRoom(participantId)).emit(eventName, payload);
  if (participantId === String(senderId)) continue;
  io.to(getUserRoom(participantId)).emit("chat:unread_count_updated", {
    chatId: String(chatId),
    userId: participantId,
    });
  }
};

const getMessageForUser = async (messageId, userId) => {
  if (!isObjectId(messageId) || !isObjectId(userId)) return null;
  const message = await Message.findById(messageId).select("_id chat sender").lean();
  if (!message) return null;
  const allowed = await isChatParticipant(String(message.chat), userId);
  return allowed ? message : null;
};

/** Get the current active event for a live, or null if none. */
const getLiveEvent = (liveId) => {
  const ev = liveEvents.get(String(liveId));
  if (!ev) return null;
  if (ev.expiresAt && new Date() > ev.expiresAt) {
    clearTimeout(ev.timerId);
    liveEvents.delete(String(liveId));
    return null;
  }
  return ev;
};

/**
 * Set a live event. Automatically clears any previous event for that live.
 * Emits LIVE_EVENT_STARTED to the live room socket.
 * @param {string} liveId
 * @param {{ type: string, label: string, icon: string, durationSecs: number }} opts
 */
const setLiveEvent = (liveId, { type, label, icon, durationSecs }) => {
  const id = String(liveId);
  // Clear any existing event
  const existing = liveEvents.get(id);
  if (existing) {
    clearTimeout(existing.timerId);
    liveEvents.delete(id);
  }

  const expiresAt = new Date(Date.now() + durationSecs * 1000);
  const timerId = setTimeout(() => {
    liveEvents.delete(id);
    if (io) {
      io.to(`live:${id}`).emit("LIVE_EVENT_ENDED", { liveId: id });
    }
  }, durationSecs * 1000);

  liveEvents.set(id, { type, label, icon, expiresAt, timerId });

  if (io) {
    io.to(`live:${id}`).emit("LIVE_EVENT_STARTED", {
      liveId: id,
      type,
      label,
      icon,
      expiresAt: expiresAt.toISOString(),
      durationSecs,
    });
  }
};

/** Manually clear a live event for the given live room. */
const clearLiveEvent = (liveId) => {
  const id = String(liveId);
  const ev = liveEvents.get(id);
  if (ev) {
    clearTimeout(ev.timerId);
    liveEvents.delete(id);
    if (io) {
      io.to(`live:${id}`).emit("LIVE_EVENT_ENDED", { liveId: id });
    }
  }
};

/**
 * Clear all live events for a specific live stream.
 * Used when a live stream ends to prevent memory leaks.
 */
const clearAllEventsForLive = (liveId) => {
  clearLiveEvent(liveId);
};

/** Return current viewer count for a live stream. */
const getLiveViewerCount = (liveId) => {
  const viewers = liveViewers.get(liveId);
  return viewers ? viewers.size : 0;
};

/** Return true when the live has at least one active host socket. */
const hasLiveHost = (liveId) => {
  const hosts = liveHosts.get(String(liveId));
  return !!(hosts && hosts.size > 0);
};

const removeHostFromLive = (socketId, liveId) => {
  if (!liveId) return;
  const hosts = liveHosts.get(liveId);
  if (!hosts) return;
  hosts.delete(socketId);
  if (hosts.size === 0) liveHosts.delete(liveId);
};

const removeHostFromAllLives = (socketId) => {
  for (const [id, hosts] of liveHosts.entries()) {
    hosts.delete(socketId);
    if (hosts.size === 0) liveHosts.delete(id);
  }
};

const clearHostForLive = (socket, liveId) => {
  if (!liveId) return;
  removeHostFromLive(socket.id, liveId);
  if (socket._liveHostRoomId === liveId) socket._liveHostRoomId = null;
};

/**
 * Clean up stale users who haven't sent a heartbeat in ONLINE_TIMEOUT_MS.
 * Emits USER_OFFLINE events for removed users.
 * @returns {string[]} Array of removed user IDs
 */
const cleanupStaleUsers = () => {
  const now = new Date();
  const staleUsers = [];
  
  for (const [userId, info] of onlineUsers.entries()) {
    const timeSinceLastSeen = now - info.lastSeen;
    if (timeSinceLastSeen > ONLINE_TIMEOUT_MS) {
      staleUsers.push(userId);
    }
  }
  
  for (const userId of staleUsers) {
    onlineUsers.delete(userId);
    if (io) {
      io.emit("USER_OFFLINE", { userId });
    }
  }
  
  return staleUsers;
};

/**
 * Return a snapshot of currently online users as an array of { userId, lastSeen } objects.
 * Filters out stale users who haven't sent a heartbeat in ONLINE_TIMEOUT_MS.
 */
const getOnlineUsers = () => {
  cleanupStaleUsers();
  
  const result = [];
  for (const [userId, info] of onlineUsers.entries()) {
    result.push({ userId, lastSeen: info.lastSeen });
  }
  
  return result;
};

/**
 * Attach Socket.io to the given HTTP server and store the instance.
 * Call once during server bootstrap.
 */
const initSocket = (httpServer) => {
  const allowedOrigins = [
    "https://meetyoulive.net",
    "https://www.meetyoulive.net",
    "http://localhost:3000",
  ];

  if (process.env.FRONTEND_URL && !allowedOrigins.includes(process.env.FRONTEND_URL)) {
    allowedOrigins.push(process.env.FRONTEND_URL);
  }

  io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        if (/^https:\/\/[a-zA-Z0-9-]+\.vercel\.app$/.test(origin)) return callback(null, true);
        return callback(new Error(`Socket CORS blocked for origin: ${origin}`));
      },
      credentials: true,
      methods: ["GET", "POST"],
    },
  });

  // Clear any existing cleanup interval to prevent duplicates
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
  }

  // Periodic cleanup of stale online users every 2 minutes
  cleanupIntervalId = setInterval(() => {
    const staleUsers = cleanupStaleUsers();
    if (staleUsers.length > 0) {
      console.log(`[Socket] Cleaned up ${staleUsers.length} stale user(s) from online list`);
    }
  }, 2 * 60 * 1000); // Run every 2 minutes

  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    if (socket._userId) joinPersonalRoom(socket);

    // Allow authenticated clients to join their personal notification/presence room.
    // The room is derived from the verified JWT, never from a client-supplied userId.
    // Legacy compatibility: current clients auto-join on connection, but older clients may still emit this event.
    socket.on("join_user_room", () => {
      if (socket._userId && !socket.rooms.has(getUserRoom(socket._userId))) {
        joinPersonalRoom(socket);
      }
    });

    // Heartbeat to update lastSeen timestamp for online users
    socket.on("heartbeat", () => {
      const userId = socket._userId;
      if (!userId) return;
      
      const entry = onlineUsers.get(userId);
      // Only update lastSeen if this socket ID is still registered for this user
      if (entry && entry.socketIds.has(socket.id)) {
        entry.lastSeen = new Date();
      }
    });

    // ── Live Room presence ───────────────────────────────────────────────
    socket.on("join_live_room", ({ liveId, user }) => {
      if (!liveId || typeof liveId !== "string" || !OBJECT_ID_RE.test(liveId)) return;
      const roomKey = `live:${liveId}`;
      socket.join(roomKey);
      socket._liveRoomId = liveId;

      if (!liveViewers.has(liveId)) {
        liveViewers.set(liveId, new Set());
      }
      liveViewers.get(liveId).add(socket.id);

      const count = getLiveViewerCount(liveId);
      io.to(roomKey).emit("VIEWER_COUNT_UPDATE", { liveId, count });

      // Notify others that a new viewer joined
      if (user && user.username) {
        socket.to(roomKey).emit("USER_JOINED_LIVE", { user, liveId });
      }
    });

    socket.on("live_host_active", async ({ liveId }) => {
      try {
        if (!liveId || typeof liveId !== "string" || !OBJECT_ID_RE.test(liveId)) return;
        if (!socket._userId) return;

        const live = await Live.findOne({ _id: liveId, user: socket._userId, isLive: true })
          .select("_id")
          .lean();
        if (!live) return;

        if (socket._liveHostRoomId && socket._liveHostRoomId !== liveId) {
          removeHostFromLive(socket.id, socket._liveHostRoomId);
        }

        if (!liveHosts.has(liveId)) {
          liveHosts.set(liveId, new Set());
        }
        liveHosts.get(liveId).add(socket.id);
        socket._liveHostRoomId = liveId;
      } catch (err) {
        console.error("[live_host_active] Error:", err);
      }
    });

    socket.on("leave_live_room", ({ liveId }) => {
      if (!liveId || typeof liveId !== "string" || !OBJECT_ID_RE.test(liveId)) return;
      const roomKey = `live:${liveId}`;
      socket.leave(roomKey);
      socket._liveRoomId = null;
      clearHostForLive(socket, liveId);

      const viewers = liveViewers.get(liveId);
      if (viewers) {
        viewers.delete(socket.id);
        if (viewers.size === 0) liveViewers.delete(liveId);
      }

      const count = getLiveViewerCount(liveId);
      io.to(roomKey).emit("VIEWER_COUNT_UPDATE", { liveId, count });
    });

    socket.on("live_chat_message", async ({ liveId, text, user }) => {
      if (!socket._userId) return;
      if (!liveId || typeof liveId !== "string" || !OBJECT_ID_RE.test(liveId)) return;
      if (!text || typeof text !== "string") return;
      const safeText = String(text).trim().slice(0, 200);
      if (!safeText) return;

      // Resolve VIP status from the authenticated user record (not from client payload)
      let isVIP = false;
      if (socket._userId) {
        try {
          const User = require("../models/User.js");
          const dbUser = await User.findById(socket._userId).select("isVIP").lean();
          isVIP = !!(dbUser && dbUser.isVIP);
        } catch (_) {
          // non-fatal
        }
      }

      const safeUser = {
        username: (user && typeof user.username === "string") ? user.username.slice(0, 100) : "Anónimo",
        userId: socket._userId || null,
        isVIP,
      };

      const roomKey = `live:${liveId}`;
      // Broadcast to all room members except the sender
      socket.to(roomKey).emit("LIVE_CHAT_MESSAGE", {
        liveId,
        user: safeUser,
        text: safeText,
        timestamp: Date.now(),
      });
    });

    // ── Private Chat rooms and realtime contract ─────────────────────────
    socket.on("chat:join", async ({ chatId } = {}, ack) => {
      try {
        if (!socket._userId || !isObjectId(chatId)) {
          if (typeof ack === "function") ack({ ok: false, message: "No autorizado" });
          return;
        }
        const allowed = await isChatParticipant(chatId, socket._userId);
        if (!allowed) {
          if (typeof ack === "function") ack({ ok: false, message: "Chat no encontrado" });
          return;
        }

        socket.join(`chat:${chatId}`);
        if (!socket._chatRoomIds) socket._chatRoomIds = new Set();
        socket._chatRoomIds.add(chatId);
        if (typeof ack === "function") ack({ ok: true, chatId });
      } catch (err) {
        console.error("[chat:join] Error:", err);
        if (typeof ack === "function") ack({ ok: false, message: "Error al unir chat" });
      }
    });

    socket.on("chat:leave", ({ chatId } = {}, ack) => {
      if (!isObjectId(chatId)) {
        if (typeof ack === "function") ack({ ok: false, message: "chatId inválido" });
        return;
      }
      socket.leave(`chat:${chatId}`);
      if (socket._chatRoomIds) socket._chatRoomIds.delete(chatId);
      if (typeof ack === "function") ack({ ok: true, chatId });
    });

    const emitChatPresenceEvent = async (eventName, data = {}) => {
      try {
        const { chatId } = data;
        if (!socket._userId || !isObjectId(chatId)) return;
        if (!socket._chatRoomIds || !socket._chatRoomIds.has(chatId)) return;
        socket.to(`chat:${chatId}`).emit(eventName, {
          ...data,
          chatId,
          userId: socket._userId,
          at: new Date().toISOString(),
        });
      } catch (err) {
        console.error(`[${eventName}] Error:`, err);
      }
    };

    socket.on("typing:start", (data) => emitChatPresenceEvent("typing:start", data));
    socket.on("typing:stop", (data) => emitChatPresenceEvent("typing:stop", data));

    socket.on("premium_gift:visual_send", async (data = {}, ack) => {
      try {
        if (!socket._userId || !isObjectId(data.receiverId)) {
          if (typeof ack === "function") ack({ ok: false, message: "No autorizado" });
          return;
        }

        const context = data.context === "call" ? "call" : "chat";
        const contextId = String(data.contextId || "");
        if (!isObjectId(contextId)) {
          if (typeof ack === "function") ack({ ok: false, message: "Contexto inválido" });
          return;
        }

        const allowed =
          context === "chat"
            ? await isChatBetweenParticipants(contextId, socket._userId, String(data.receiverId))
            : await isCallBetweenParticipants(contextId, socket._userId, String(data.receiverId));
        if (!allowed) {
          if (typeof ack === "function") ack({ ok: false, message: "No autorizado" });
          return;
        }

        const sender = await User.findById(socket._userId).select("username name").lean();
        const payload = {
          eventId: String(data.eventId || `${Date.now()}-${socket.id}`).slice(0, 80),
          visualOnly: true,
          context,
          contextId,
          senderId: socket._userId,
          receiverId: String(data.receiverId),
          senderName: sender?.username || sender?.name || "Alguien",
          gift: sanitizeVisualGift(data.gift),
          quantity: [1, 5, 10, 50].includes(Number(data.quantity)) ? Number(data.quantity) : 1,
          at: new Date().toISOString(),
        };

        io.to(getUserRoom(socket._userId)).emit("PREMIUM_GIFT_VISUAL", payload);
        io.to(getUserRoom(String(data.receiverId))).emit("PREMIUM_GIFT_VISUAL", payload);
        if (typeof ack === "function") ack({ ok: true });
      } catch (err) {
        console.error("[premium_gift:visual_send] Error:", err);
        if (typeof ack === "function") ack({ ok: false, message: "Error al enviar regalo visual" });
      }
    });

    const emitMessageStatusEvent = async (eventName, data = {}) => {
      try {
        if (!socket._userId) return;
        const message = await getMessageForUser(data.messageId || data._id, socket._userId);
        if (!message) return;
        const payload = {
          ...data,
          messageId: String(message._id),
          chatId: String(message.chat),
          userId: socket._userId,
          at: new Date().toISOString(),
        };
        socket.to(`chat:${message.chat}`).emit(eventName, payload);
        io.to(getUserRoom(socket._userId)).emit(eventName, payload);
      } catch (err) {
        console.error(`[${eventName}] Error:`, err);
      }
    };

    socket.on("message:delivered", (data) => emitMessageStatusEvent("message:delivered", data));
    socket.on("message:read", (data) => emitMessageStatusEvent("message:read", data));
    socket.on("message:updated", (data) => emitMessageStatusEvent("message:updated", data));
    socket.on("message:deleted", (data) => emitMessageStatusEvent("message:deleted", data));
    socket.on("reaction:added", (data) => emitMessageStatusEvent("reaction:added", data));
    socket.on("reaction:removed", (data) => emitMessageStatusEvent("reaction:removed", data));

    // ── Social Room presence ────────────────────────────────────────────
    socket.on("join_social_room", ({ roomId, user }) => {
      if (!roomId || typeof roomId !== "string" || !OBJECT_ID_RE.test(roomId)) return;
      const roomKey = `social_room:${roomId}`;
      socket.join(roomKey);
      socket._socialRoomId = roomId;
      // Notify others in the room
      socket.to(roomKey).emit("ROOM_USER_JOINED", { user, roomId });
    });

    socket.on("leave_social_room", ({ roomId }) => {
      if (!roomId || typeof roomId !== "string") return;
      const roomKey = `social_room:${roomId}`;
      socket.leave(roomKey);
      socket._socialRoomId = null;
      socket.to(roomKey).emit("ROOM_USER_LEFT", { userId: socket._userId, roomId });
    });

    socket.on("disconnect", () => {
      const userId = socket._userId;
      if (userId) {
        const entry = onlineUsers.get(userId);
        if (entry) {
          entry.socketIds.delete(socket.id);
          if (entry.socketIds.size === 0) {
            // No remaining sockets — user is truly offline
            onlineUsers.delete(userId);
            io.emit("USER_OFFLINE", { userId });
          }
        }
      }
      // Leave social room if user was in one
      const socialRoomId = socket._socialRoomId;
      if (socialRoomId) {
        socket.to(`social_room:${socialRoomId}`).emit("ROOM_USER_LEFT", { userId, roomId: socialRoomId });
      }
      // Clean up live room viewer tracking
      const liveRoomId = socket._liveRoomId;
      if (liveRoomId) {
        const viewers = liveViewers.get(liveRoomId);
        if (viewers) {
          viewers.delete(socket.id);
          if (viewers.size === 0) liveViewers.delete(liveRoomId);
        }
        const count = getLiveViewerCount(liveRoomId);
        io.to(`live:${liveRoomId}`).emit("VIEWER_COUNT_UPDATE", { liveId: liveRoomId, count });
      }
      // Auto-cleanup: if this was a host socket and no hosts remain, end the live stream
      const hostRoomId = socket._liveHostRoomId;
      if (hostRoomId) {
        removeHostFromLive(socket.id, hostRoomId);
        socket._liveHostRoomId = null;
        
        // Check if stream has no more hosts
        if (!hasLiveHost(hostRoomId)) {
          console.log("[socket] No hosts remaining for live stream, auto-ending", {
            liveId: hostRoomId,
            userId: socket._userId,
          });
          
          // End the stream in database (fire-and-forget to avoid blocking disconnect)
          Live.findOneAndUpdate(
            { _id: hostRoomId, isLive: true },
            { isLive: false, endedAt: new Date() }
          )
            .then((updated) => {
              if (updated) {
                console.log("[socket] Live stream auto-ended in DB", { liveId: hostRoomId });
                
                // Clean up all live events and timers to prevent memory leaks
                clearAllEventsForLive(hostRoomId);
                
                // Clean up viewer tracking
                liveViewers.delete(hostRoomId);
                
                // Notify all viewers that stream has ended
                io.to(`live:${hostRoomId}`).emit("LIVE_STREAM_ENDED", {
                  liveId: hostRoomId,
                  reason: "host_disconnected",
                });
              }
            })
            .catch((err) => {
              console.error("[socket] Failed to auto-end live stream", {
                liveId: hostRoomId,
                error: err.message,
              });
            });
        }
      } else {
        // If socket was in host map but didn't have _liveHostRoomId, clean up anyway
        removeHostFromAllLives(socket.id);
      }
    });
  });

  return io;
};

/**
 * Return the shared io instance.
 * Returns null if initSocket has not been called yet.
 */
const getIO = () => io;

module.exports = { 
  initSocket, 
  getIO, 
  getOnlineUsers, 
  hasLiveHost, 
  getLiveEvent, 
  setLiveEvent, 
  clearLiveEvent,
  clearAllEventsForLive,
  emitChatMessage,
};
