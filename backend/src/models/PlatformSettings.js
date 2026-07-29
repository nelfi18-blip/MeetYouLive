"use strict";

const mongoose = require("mongoose");

const chatProtectionSchema = new mongoose.Schema(
  {
    chatProtectionEnabled: { type: Boolean, default: true },
    blockPhones: { type: Boolean, default: true },
    blockEmails: { type: Boolean, default: true },
    blockUrls: { type: Boolean, default: true },
    blockSocialMedia: { type: Boolean, default: true },
    minimumDaysSinceMatch: { type: Number, default: 7, min: 0, max: 3650 },
    minimumMessages: { type: Number, default: 20, min: 0, max: 100000 },
    minimumCompletedCalls: { type: Number, default: 0, min: 0, max: 10000 },
    minimumCoinsSpent: { type: Number, default: 0, min: 0, max: 100000000 },
    trustRuleMode: { type: String, enum: ["all", "any"], default: "all" },
  },
  { _id: false }
);

const socialCallsSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: true },
    maxDurationSeconds: { type: Number, default: 900, min: 60, max: 14400 },
    timeoutSeconds: { type: Number, default: 45, min: 10, max: 300 },
    futureRules: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { _id: false }
);

const platformSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "global", index: true },
    boostPriceCrush: { type: Number, default: 50, min: 1, max: 1000000 },
    boostPackPrice: { type: Number, default: 200, min: 1, max: 1000000 },
    hiddenLikePrice: { type: Number, default: 20, min: 1, max: 1000000 },
    dailyRewardBaseCoins: { type: Number, default: 20, min: 1, max: 1000000 },
    referralRewardCoins: { type: Number, default: 50, min: 0, max: 1000000 },
    creatorPlatformSplitPercent: { type: Number, default: 40, min: 0, max: 100 },
    socialCalls: { type: socialCallsSchema, default: () => ({}) },
    chatProtection: { type: chatProtectionSchema, default: () => ({}) },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PlatformSettings", platformSettingsSchema);
