const mongoose = require("mongoose");

const payoutSchema = new mongoose.Schema(
  {
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Unique, persistent identifier for the withdrawal REQUEST that produced
    // this payout (generated server-side with crypto.randomUUID() before the
    // reservation transaction starts — see requestPayout in
    // creator.controller.js). This disambiguates "which exact request
    // created this document" from the creator's other payouts, so an
    // ambiguous-commit check (or a retry) can confirm the outcome of THIS
    // specific request instead of matching any other pending/approved
    // payout the creator may have. `sparse` keeps the unique index from
    // conflicting with historical documents created before this field
    // existed (which have no requestId at all).
    requestId: {
      type: String,
      default: null,
      unique: true,
      sparse: true,
      index: true,
    },
    amountCoins: { type: Number, required: true, min: 1 },
    amountUsd: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "paid"],
      default: "pending",
    },
    method: {
      type: String,
      enum: ["zelle", "paypal", "bank", "stripe", "other"],
      default: "stripe",
    },
    paymentDetails: { type: String, default: "" },
    rejectionReason: { type: String, default: "" },
    notes: { type: String, default: "" },
    requestedAt: { type: Date, default: Date.now },
    approvedAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payout", payoutSchema);
