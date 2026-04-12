const { Server } = require("socket.io");

let io = null;

// In-memory map of currently online users: userId (string) → { lastSeen: Date, socketIds: Set<string> }
const onlineUsers = new Map();

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
