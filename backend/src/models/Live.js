const mongoose = require("mongoose");

const liveSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    description: { type: String },
    streamKey: { type: String, required: true, unique: true },
    category: { type: String, default: "" },
    isLive: { type: Boolean, default: false },
    viewerCount: { type: Number, default: 0 },
    endedAt: { type: Date },
    isPrivate: { type: Boolean, default: false },
    entryCost: { type: Number, default: 0, min: 0 },
    paidViewers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Live", liveSchema);
