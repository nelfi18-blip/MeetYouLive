const mongoose = require("mongoose");

const giftSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    giftCatalogItem: { type: mongoose.Schema.Types.ObjectId, ref: "GiftCatalog" },
    live: { type: mongoose.Schema.Types.ObjectId, ref: "Live" },
    coinCost: { type: Number, required: true, min: 1 },
    creatorShare: { type: Number, required: true, min: 0 },
    platformShare: { type: Number, required: true, min: 0 },
    agencyShare: { type: Number, default: 0, min: 0 },
    referrerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    agencyPercentageApplied: { type: Number, default: 0, min: 0 },
    context: {
      type: String,
      enum: ["live", "profile", "private_call"],
      default: "profile",
    },
    contextId: { type: String, default: null },
    message: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Gift", giftSchema);
