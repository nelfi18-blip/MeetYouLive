"use strict";

const mongoose = require("mongoose");

const chatProtectionAttemptSchema = new mongoose.Schema(
  {
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // Required for private-chat attempts; absent for Live room attempts, which
    // use `liveId` instead (a Live has many participants, not a single Chat).
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: function requiresChatId() { return !this.liveId; },
      index: true,
    },
    liveId: { type: mongoose.Schema.Types.ObjectId, ref: "Live", default: null, index: true },
    detectedTypes: {
      type: [String],
      default: [],
      validate: {
        validator: (items) => items.every((item) => ["phone", "email", "url", "social_media", "money_request"].includes(item)),
        message: "Invalid detected type",
      },
    },
    ruleApplied: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    source: { type: String, enum: ["web", "android", "unknown"], default: "unknown", index: true },
    contentHash: { type: String, default: "" },
  },
  { timestamps: true }
);

chatProtectionAttemptSchema.index({ chatId: 1, createdAt: -1 });
chatProtectionAttemptSchema.index({ senderId: 1, createdAt: -1 });

module.exports = mongoose.model("ChatProtectionAttempt", chatProtectionAttemptSchema);
