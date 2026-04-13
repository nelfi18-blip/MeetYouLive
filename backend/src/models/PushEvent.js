const mongoose = require("mongoose");

/**
 * PushEvent – a single push notification queued for delivery.
 *
 * Events are buffered so that:
 *  - Multiple "like" events in the same 5-minute window are aggregated into
 *    one grouped push.
 *  - A reminder push can be dispatched 2–4 h after delivery if the user has
 *    not opened the notification (openedAt is still null).
 *
 * Priority values map to the required delivery order:
 *  1 = match · 2 = like · 3 = live · 4 = reward · 5 = reactivation
 */
const pushEventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["match", "like", "live", "reward", "reactivation"],
      required: true,
    },
    priority: { type: Number, required: true },
    payload: {
      title: { type: String, default: "" },
      body: { type: String, default: "" },
      data: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    /** Bucketing key used to group events of the same type together. */
    groupKey: { type: String, index: true },
    status: {
      type: String,
      enum: ["pending", "sent", "cancelled"],
      default: "pending",
      index: true,
    },
    /** Earliest moment this event may be dispatched. */
    scheduledAt: { type: Date, required: true, index: true },
    sentAt: { type: Date, default: null },
    /** When a follow-up reminder may be sent if not opened. */
    reminderScheduledAt: { type: Date, default: null, index: true },
    reminderSentAt: { type: Date, default: null },
    /** Set by the frontend when the user taps the notification. */
    openedAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// Compound index for the flush-queue query
pushEventSchema.index({ status: 1, scheduledAt: 1, priority: 1 });
// Compound index for the reminder query
pushEventSchema.index({ status: 1, reminderScheduledAt: 1, openedAt: 1 });

const PushEvent = mongoose.model("PushEvent", pushEventSchema);
module.exports = PushEvent;
