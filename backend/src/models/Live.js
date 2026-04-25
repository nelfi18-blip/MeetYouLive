const mongoose = require("mongoose");

const liveSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    description: { type: String },
    streamKey: { type: String, required: true, unique: true },
    category: { type: String, default: "" },
    language: { type: String, default: "" },
    isLive: { type: Boolean, default: false },
    viewerCount: { type: Number, default: 0 },
    endedAt: { type: Date },
    isPrivate: { type: Boolean, default: false },
    entryCost: { type: Number, default: 0, min: 0 },
    paidViewers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    chatEnabled: { type: Boolean, default: true },
    giftsEnabled: { type: Boolean, default: true },
    goal: {
      active:   { type: Boolean, default: false },
      title:    { type: String,  default: "" },
      target:   { type: Number,  default: 0,  min: 0 },
      progress: { type: Number,  default: 0,  min: 0 },
      reward:   { type: String,  default: "" },
    },
    battle: {
      active:     { type: Boolean, default: false },
      title:      { type: String,  default: "" },
      leftLabel:  { type: String,  default: "Equipo A" },
      rightLabel: { type: String,  default: "Equipo B" },
      leftScore:  { type: Number,  default: 0, min: 0 },
      rightScore: { type: Number,  default: 0, min: 0 },
      endsAt:     { type: Date },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Live", liveSchema);
