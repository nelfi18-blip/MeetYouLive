const { Router } = require("express");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const Notification = require("../models/Notification.js");

const router = Router();

const notifLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

// GET /api/notifications — paginated notification list for the authenticated user
router.get("/", notifLimiter, verifyToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_LIMIT));
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      Notification.find({ userId: req.userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments({ userId: req.userId }),
    ]);

    res.json({
      notifications,
      page,
      limit,
      total,
      hasMore: skip + notifications.length < total,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/notifications/unread-count — fast unread badge count
router.get("/unread-count", notifLimiter, verifyToken, async (req, res) => {
  try {
    const count = await Notification.countDocuments({ userId: req.userId, isRead: false });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/notifications/read-all — mark all notifications as read
router.patch("/read-all", notifLimiter, verifyToken, async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.userId, isRead: false }, { $set: { isRead: true } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/notifications/:id/read — mark a single notification as read
router.patch("/:id/read", notifLimiter, verifyToken, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "id inválido" });
    }
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { $set: { isRead: true } },
      { new: true }
    );
    if (!notif) return res.status(404).json({ message: "Notificación no encontrada" });
    res.json(notif);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
