const mongoose = require("mongoose");

const coinTransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: [
        "crush_sent",
        "crush_received",
        "purchase",
        "gift_sent",
        "gift_received",
        "private_call",
        "call_started",
        "call_earned",
        "room_entry",
        "content_unlock",
        "content_earned",
        "refund",
        "admin_adjustment",
        "agency_earned",
        "agency_distributed",
      ],
      required: true,
    },
    amount: { type: Number, required: true },
    reason: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "completed",
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

const CoinTransaction = mongoose.model("CoinTransaction", coinTransactionSchema);

module.exports = CoinTransaction;
