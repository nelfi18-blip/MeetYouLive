const mongoose = require("mongoose");

/**
 * PushAnalytic – records each push-related action for analytics.
 *
 * action values:
 *  "sent"      – a push was delivered to FCM
 *  "opened"    – the user tapped the notification
 *  "converted" – the user performed a monetisation action after opening
 */
const pushAnalyticSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    pushEventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PushEvent",
      default: null,
    },
    type: {
      type: String,
      enum: ["match", "like", "live", "reward", "reactivation"],
      required: true,
    },
    action: {
      type: String,
      enum: ["sent", "opened", "converted"],
      required: true,
    },
    /** e.g. { aggregated: true, count: 5 } or { conversionType: "coins_spent" } */
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// Useful for dashboard aggregations
pushAnalyticSchema.index({ action: 1, createdAt: -1 });
pushAnalyticSchema.index({ type: 1, action: 1 });

const PushAnalytic = mongoose.model("PushAnalytic", pushAnalyticSchema);
module.exports = PushAnalytic;
