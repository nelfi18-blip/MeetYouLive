const mongoose = require("mongoose");

const giftSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    live: { type: mongoose.Schema.Types.ObjectId, ref: "Live" },
    amount: { type: Number, required: true, min: 1 },
    message: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Gift", giftSchema);
