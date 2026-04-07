const mongoose = require("mongoose");

/**
 * Tracks revenue-generating Super Crush transactions.
 * One document per super crush sent.
 */
const crushTransactionSchema = new mongoose.Schema(
  {
    fromUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    toUser:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    coinsSpent: { type: Number, required: true, min: 1 },
    isCreatorTarget: { type: Boolean, default: false },
    platformShare:   { type: Number, default: 0 },
    creatorShare:    { type: Number, default: 0 },
    agencyShare:     { type: Number, default: 0 },
    referrerId:      { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    agencyPercentageApplied: { type: Number, default: 0 },
    matchCreated: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CrushTransaction", crushTransactionSchema);
