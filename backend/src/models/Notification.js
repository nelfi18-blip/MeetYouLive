const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    data: { type: Object, default: {} },
    dedupeKey: { type: String, default: null },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Fast per-user queries sorted by newest first
notificationSchema.index({ userId: 1, createdAt: -1 });
// Fast unread count
notificationSchema.index({ userId: 1, isRead: 1 });
// Optional idempotency key for webhook/retry-safe notification emission
notificationSchema.index(
  { userId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } }
);

module.exports = mongoose.model("Notification", notificationSchema);
