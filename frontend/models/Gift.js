import mongoose from "mongoose";

const GiftSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    emoji: { type: String, required: true },
    coinCost: { type: Number, required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    liveId: { type: mongoose.Schema.Types.ObjectId, ref: "Live" },
    message: { type: String },
  },
  { timestamps: true }
);

export default mongoose.models.Gift || mongoose.model("Gift", GiftSchema);
