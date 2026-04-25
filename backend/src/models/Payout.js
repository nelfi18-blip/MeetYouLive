const mongoose = require("mongoose");

const payoutSchema = new mongoose.Schema(
  {
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amountCoins: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      // pending → approved → paid | pending/approved → rejected
      // "processing" and "completed" kept for backward compatibility with older records
      enum: ["pending", "approved", "paid", "rejected", "processing", "completed"],
      default: "pending",
    },
    notes: { type: String, default: "" },
    rejectionReason: { type: String, default: "" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payout", payoutSchema);
