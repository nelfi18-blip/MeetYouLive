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
    const result = await Notification.insertMany(docs, { ordered: false });
    if (result.length < docs.length) {
      console.warn(`[notifications] Bulk insert: ${result.length}/${docs.length} documents saved`);
    }
    const io = getIO();
    if (io) {
      // Emit to each user with their specific document _id so clients can reference it
      for (let i = 0; i < result.length; i++) {
        const doc = result[i];
        io.to(String(doc.userId)).emit("NEW_NOTIFICATION", {
          _id: doc._id,
          type,
          title,
          message,
          data,
          isRead: false,
          createdAt: now,
        });
      }
    }
  } catch (err) {
    console.error("[notifications] Failed to create bulk notifications:", err.message);
  }
};

module.exports = { createNotification, createBulkNotifications };
