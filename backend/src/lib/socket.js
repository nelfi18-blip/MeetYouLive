const { Server } = require("socket.io");

let io = null;

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

module.exports = { initSocket, getIO };
