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
      enum: ["pending", "approved", "processing", "completed", "paid", "rejected"],
      default: "pending",
    },
    rejectionReason: { type: String, default: "" },
    notes: { type: String, default: "" },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payout", payoutSchema);
