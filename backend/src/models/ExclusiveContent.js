const mongoose = require("mongoose");

const exclusiveContentSchema = new mongoose.Schema(
  {
    creator: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    thumbnailUrl: { type: String, default: "" },
    contentUrl: { type: String, required: true },
    coinPrice: { type: Number, required: true, min: 1 },
    isPublished: { type: Boolean, default: true },
    totalUnlocks: { type: Number, default: 0, min: 0 },
    totalEarnings: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ExclusiveContent", exclusiveContentSchema);
