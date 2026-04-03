const mongoose = require("mongoose");

const exclusiveUnlockSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: mongoose.Schema.Types.ObjectId, ref: "ExclusiveContent", required: true },
    coinsPaid: { type: Number, required: true },
    creatorShare: { type: Number, required: true },
    platformShare: { type: Number, required: true },
    agencyShare: { type: Number, default: 0, min: 0 },
    referrerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    agencyPercentageApplied: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// A user can only unlock each piece of content once
exclusiveUnlockSchema.index({ user: 1, content: 1 }, { unique: true });

module.exports = mongoose.model("ExclusiveUnlock", exclusiveUnlockSchema);
