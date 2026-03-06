const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: ["purchase", "gift_sent", "gift_received"],
      required: true,
    },
    coins: { type: Number, required: true },
    stripeSessionId: { type: String },
    description: { type: String },
  },
  { timestamps: true }
);

walletSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("Wallet", walletSchema);
