const { Server } = require("socket.io");

let io = null;

// In-memory map of currently online users: userId (string) → { lastSeen: Date, socketIds: Set<string> }
const onlineUsers = new Map();

// In-memory map of live room viewers: liveId (string) → Set<socketId>
const liveViewers = new Map();

/** Return current viewer count for a live stream. */
const getLiveViewerCount = (liveId) => {
  const viewers = liveViewers.get(liveId);
  return viewers ? viewers.size : 0;
};

/**
 * Return a snapshot of currently online users as an array of { userId, lastSeen } objects.
 */
const getOnlineUsers = () => {
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

  io.on("connection", (socket) => {
    // Allow authenticated clients to join their personal notification room
    socket.on("join_user_room", (userId) => {
      if (userId && typeof userId === "string" && /^[a-f0-9]{24}$/.test(userId)) {
        socket.join(userId);
        socket._userId = userId;

        const existing = onlineUsers.get(userId);
        if (existing) {
          // User already has other active sockets — just add this one
          existing.socketIds.add(socket.id);
          existing.lastSeen = new Date();
        } else {
          // First socket for this user — mark as online
          onlineUsers.set(userId, { lastSeen: new Date(), socketIds: new Set([socket.id]) });
          io.emit("USER_ONLINE", { userId });
        }
      }
    });

    // ── Live Room presence ───────────────────────────────────────────────
    socket.on("join_live_room", ({ liveId, user }) => {
      if (!liveId || typeof liveId !== "string" || !/^[a-f0-9]{24}$/.test(liveId)) return;
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

    socket.on("leave_live_room", ({ liveId }) => {
      if (!liveId || typeof liveId !== "string" || !/^[a-f0-9]{24}$/.test(liveId)) return;
      const roomKey = `live:${liveId}`;
      socket.leave(roomKey);
      socket._liveRoomId = null;

      const viewers = liveViewers.get(liveId);
      if (viewers) {
        viewers.delete(socket.id);
        if (viewers.size === 0) liveViewers.delete(liveId);
      }

      const count = getLiveViewerCount(liveId);
      io.to(roomKey).emit("VIEWER_COUNT_UPDATE", { liveId, count });
    });

    socket.on("live_chat_message", ({ liveId, text, user }) => {
      if (!liveId || typeof liveId !== "string" || !/^[a-f0-9]{24}$/.test(liveId)) return;
      if (!text || typeof text !== "string") return;
      const safeText = String(text).trim().slice(0, 200);
      if (!safeText) return;

      const roomKey = `live:${liveId}`;
      // Broadcast to all room members except the sender
      socket.to(roomKey).emit("LIVE_CHAT_MESSAGE", {
        liveId,
        user: user || { username: "Anónimo" },
        text: safeText,
        timestamp: Date.now(),
      });
    });

    // ── Social Room presence ────────────────────────────────────────────
    socket.on("join_social_room", ({ roomId, user }) => {
      if (!roomId || typeof roomId !== "string" || !/^[a-f0-9]{24}$/.test(roomId)) return;
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
    });
  });

  return io;
};

/**
 * Return the shared io instance.
 * Returns null if initSocket has not been called yet.
 */
const getIO = () => io;

module.exports = { initSocket, getIO, getOnlineUsers };
