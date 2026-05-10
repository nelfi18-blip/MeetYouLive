const mongoose = require("mongoose");

const purchaseSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    video: { type: mongoose.Schema.Types.ObjectId, ref: "Video", required: true },
    amount: { type: Number, required: true, min: 0 },
    stripeSessionId: String,
  },
  { timestamps: true }
);

// Unique index on stripeSessionId to prevent duplicate purchase recording
purchaseSchema.index({ stripeSessionId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Purchase", purchaseSchema);
