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
    // reservation transaction starts, or supplied by the client as an
    // Idempotency-Key — see requestPayout in creator.controller.js). This
    // disambiguates "which exact request created this document" from the
    // creator's other payouts, so an ambiguous-commit check (or a retry,
    // internal or a fresh HTTP replay) can confirm the outcome of THIS
    // specific request instead of matching any other pending/approved
    // payout the creator may have.
    //
    // IMPORTANT — no `default`: Mongoose's `default: null` would explicitly
    // write `requestId: null` on every document that doesn't set one. A
    // `sparse` MongoDB index only excludes documents where the field is
    // completely ABSENT; it still enforces uniqueness across documents that
    // explicitly store `null`. With a default of `null`, every such document
    // would collide on that shared `null` value, so the second Payout ever
    // created without an explicit requestId would fail to insert with a
    // duplicate-key error. Omitting `default` entirely means the field is
    // simply left unset (undefined) unless our code assigns it — which is
    // exactly what historical documents created before this field existed
    // look like, so they are never touched by the unique constraint either.
    // `unique: true` already creates the index, so no extra `index: true`.
    requestId: {
      type: String,
      unique: true,
      sparse: true,
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
