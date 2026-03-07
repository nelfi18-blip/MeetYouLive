import mongoose from "mongoose";

const UserWalletSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    coins: { type: Number, default: 0 },
    totalEarned: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.models.UserWallet ||
  mongoose.model("UserWallet", UserWalletSchema);
