const mongoose = require("mongoose");

const contentUnlockSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    content: { type: mongoose.Schema.Types.ObjectId, ref: "ExclusiveContent" },

    coinCost: Number,
    creatorShare: Number,
    platformShare: Number,
  },
  { timestamps: true }
);

module.exports = mongoose.model("ContentUnlock", contentUnlockSchema);
