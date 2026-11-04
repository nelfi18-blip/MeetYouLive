const mongoose = require("mongoose");

// Operational fence, not a billing ledger. No email, price, balance or credentials.
// No TTL/automatic lease stealing: a crashed Stripe mutation may still complete.
const schema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  phase: { type: String, enum: ["idle", "working", "deleted"], default: "idle" },
  owner: { type: String, default: null },
  operation: String,
  startedAt: Date,
  customerIds: { type: [String], default: [] },
  review: {
    required: { type: Boolean, default: true },
    reason: String,
    reviewedBy: String,
    reviewedAt: Date,
  },
  lastMutation: {
    kind: String,
    key: String,
    status: { type: String, enum: ["pending", "confirmed", "unknown"] },
    externalId: String,
    startedAt: Date,
  },
}, { timestamps: true });

module.exports = mongoose.model("StripeSubscriptionLifecycle", schema);
