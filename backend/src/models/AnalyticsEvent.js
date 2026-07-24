const mongoose = require("mongoose");

const analyticsEventSchema = new mongoose.Schema(
  {
    event: {
      type: String,
      enum: [
        "landing_view",
        "register_cta_click",
        "login_cta_click",
        "google_login_click",
        "registration_started",
        "registration_submitted",
        "registration_failed",
        "email_verification_view",
        "email_verified",
        "onboarding_started",
        "onboarding_step_completed",
        "onboarding_completed",
        "feed_reached",
        "login_completed",
        "profile_completed",
        "first_like",
        "first_match",
        "first_message",
        "first_live_join",
        "first_live_started",
        "coins_checkout_started",
        "coins_purchase_completed",
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
    eventName: { type: String, index: true },
    anonymousVisitorId: { type: String, trim: true, maxlength: 80, index: true },
    sessionId: { type: String, trim: true, maxlength: 80, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    source: {
      type: String,
      enum: ["instagram", "facebook", "tiktok", "whatsapp", "google", "direct", "other"],
      default: "direct",
      index: true,
    },
    medium: { type: String, trim: true, maxlength: 80 },
    campaign: { type: String, trim: true, maxlength: 120 },
    content: { type: String, trim: true, maxlength: 120 },
    referrerHost: { type: String, trim: true, maxlength: 160 },
    path: { type: String, trim: true, maxlength: 240 },
    locale: { type: String, trim: true, maxlength: 12, index: true },
    deviceCategory: {
      type: String,
      enum: ["mobile", "tablet", "desktop", "unknown"],
      default: "unknown",
      index: true,
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    dedupeKey: { type: String, trim: true, maxlength: 180, index: true },
    excluded: { type: Boolean, default: false, index: true },
    excludeReason: { type: String, trim: true, maxlength: 80 },
    expiresAt: { type: Date },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

analyticsEventSchema.pre("validate", function analyticsEventPreValidate(next) {
  if (!this.eventName) this.eventName = this.event;
  next();
});

// Compound index for time-scoped queries in the metrics endpoint
analyticsEventSchema.index({ event: 1, createdAt: -1 });
analyticsEventSchema.index({ userId: 1, createdAt: -1 });
analyticsEventSchema.index({ event: 1, anonymousVisitorId: 1, createdAt: -1 });
analyticsEventSchema.index({ event: 1, sessionId: 1, createdAt: -1 });
analyticsEventSchema.index({ source: 1, createdAt: -1 });
analyticsEventSchema.index({ createdAt: -1, excluded: 1 });
analyticsEventSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });
analyticsEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const AnalyticsEvent = mongoose.model("AnalyticsEvent", analyticsEventSchema);

module.exports = AnalyticsEvent;
