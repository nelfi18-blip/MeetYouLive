const mongoose = require("mongoose");

const videocallSchema = new mongoose.Schema(
  {
    caller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "ended", "missed"],
      default: "pending",
    },
    type: {
      type: String,
      enum: ["social", "paid_creator"],
      default: "social",
    },
    callCoins: { type: Number, default: 0, min: 0 },
    pricePerMinute: { type: Number, default: 0, min: 0 },
    startedAt: { type: Date, default: null },
    offerSdp: { type: String, default: null },
    answerSdp: { type: String, default: null },
    // ICE candidates stored as JSON-stringified objects
    callerCandidates: [{ type: String }],
    calleeCandidates: [{ type: String }],
    endedAt: { type: Date, default: null },
    totalDurationSeconds: { type: Number, default: 0, min: 0 },
    totalCoinsCharged: { type: Number, default: 0, min: 0 },
    creatorShare: { type: Number, default: 0, min: 0 },
    platformShare: { type: Number, default: 0, min: 0 },
    agencyShare: { type: Number, default: 0, min: 0 },
    referrerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    agencyPercentageApplied: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("VideoCall", videocallSchema);
