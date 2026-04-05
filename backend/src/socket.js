const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

let io = null;

/**
 * Attach a Socket.io server to an existing HTTP server.
 * Authenticates connections with the same JWT used by REST routes.
 * Each authenticated user automatically joins the room "user:<userId>"
 * so that targeted notifications can be delivered via io.to("user:<id>").emit(…).
 *
 * @param {import("http").Server} httpServer
 * @returns {import("socket.io").Server}
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
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // JWT authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error("Authentication token missing"));
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = String(decoded.id || decoded._id || decoded.userId);
      return next();
    } catch {
      return next(new Error("Invalid authentication token"));
    }
  });

  io.on("connection", (socket) => {
    // Join the user's private room so we can push targeted notifications.
    // Room name format: "user:<userId>" — controllers call
    // io.to("user:<id>").emit(…) to reach a specific user across all their
    // connected sockets (e.g. multiple browser tabs).
    socket.join(`user:${socket.userId}`);
    console.log(`[socket] connected uid=${socket.userId} socket=${socket.id}`);

    socket.on("disconnect", () => {
      console.log(`[socket] disconnected uid=${socket.userId} socket=${socket.id}`);
    });
  });

  return io;
};

/**
 * Return the initialised Socket.io server instance.
 * Returns null if initSocket() has not been called yet.
 */
const getIo = () => io;

module.exports = { initSocket, getIo };
