const mongoose = require("mongoose");

const accessPassSchema = new mongoose.Schema(
  {
    holder: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["backstage_pass", "vip_live_pass", "private_date", "inner_circle"],
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "used", "expired"],
      default: "active",
    },
    sparkCost: { type: Number, required: true, min: 0 },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// Index to quickly find active passes that haven't expired
accessPassSchema.index({ holder: 1, type: 1, status: 1, expiresAt: 1 });

const AccessPass = mongoose.model("AccessPass", accessPassSchema);

module.exports = AccessPass;
