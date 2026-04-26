const Notification = require("../models/Notification.js");
const { getIO } = require("../lib/socket.js");

/**
 * Create a single persisted notification and push it in real-time via Socket.io.
 * Fire-and-forget safe: never throws.
 */
const createNotification = async (userId, { type, title, message, data = {} }) => {
  try {
    const notif = await Notification.create({ userId, type, title, message, data });
    const io = getIO();
    if (io) {
      io.to(String(userId)).emit("NEW_NOTIFICATION", {
        _id: notif._id,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        data: notif.data,
        isRead: false,
        createdAt: notif.createdAt,
      });
    }
    return notif;
  } catch (err) {
    console.error("[notifications] Failed to create notification:", err.message);
    return null;
  }
};

/**
 * Batch-create notifications for many users at once (e.g. "creator went live").
 * Uses insertMany for efficiency. Also emits socket event to each user room.
 * Fire-and-forget safe: never throws.
 */
const createBulkNotifications = async (userIds, { type, title, message, data = {} }) => {
  if (!userIds || userIds.length === 0) return;
  try {
    const now = new Date();
    const docs = userIds.map((userId) => ({
      userId,
      type,
      title,
      message,
      data,
      isRead: false,
      createdAt: now,
      updatedAt: now,
    }));
    await Notification.insertMany(docs, { ordered: false });
    const io = getIO();
    if (io) {
      const payload = { type, title, message, data, isRead: false, createdAt: now };
      for (const userId of userIds) {
        io.to(String(userId)).emit("NEW_NOTIFICATION", payload);
      }
    }
  } catch (err) {
    console.error("[notifications] Failed to create bulk notifications:", err.message);
  }
};

module.exports = { createNotification, createBulkNotifications };
