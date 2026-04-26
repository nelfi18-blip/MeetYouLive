const mongoose = require("mongoose");

const analyticsEventSchema = new mongoose.Schema(
  {
    event: {
      type: String,
      enum: [
        "gift_sent",
        "coins_purchased",
        "vip_subscribed",
        "vip_canceled",
        "live_joined",
        "live_duration",
        "referral_shared",
        "referral_converted",
      ],
      required: true,
      index: true,
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// Compound index for time-scoped queries in the metrics endpoint
analyticsEventSchema.index({ event: 1, createdAt: -1 });
analyticsEventSchema.index({ userId: 1, createdAt: -1 });

const AnalyticsEvent = mongoose.model("AnalyticsEvent", analyticsEventSchema);

module.exports = AnalyticsEvent;
