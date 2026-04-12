const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const {
  listRooms,
  getRoom,
  getMessages,
  postMessage,
  highlightUser,
} = require("../controllers/socialRoom.controller.js");

const router = Router();

const msgLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 10,
  message: { message: "Demasiados mensajes, espera un momento" },
});

// Public — anyone can list and view rooms
router.get("/", listRooms);
router.get("/:id", getRoom);
router.get("/:id/messages", getMessages);

// Authenticated
router.post("/:id/messages", msgLimiter, verifyToken, postMessage);
router.post("/:id/highlight", verifyToken, highlightUser);

module.exports = router;
