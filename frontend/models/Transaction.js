import mongoose from "mongoose";

const TransactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: ["coin_purchase", "gift_send", "gift_receive", "withdrawal"],
      required: true,
    },
    amount: { type: Number, required: true },
    coins: { type: Number, default: 0 },
    stripeSessionId: { type: String },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

export default mongoose.models.Transaction ||
  mongoose.model("Transaction", TransactionSchema);
