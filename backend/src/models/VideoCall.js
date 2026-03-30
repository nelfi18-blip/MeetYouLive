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
    offerSdp: { type: String, default: null },
    answerSdp: { type: String, default: null },
    // ICE candidates stored as JSON-stringified objects
    callerCandidates: [{ type: String }],
    calleeCandidates: [{ type: String }],
    endedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("VideoCall", videocallSchema);
