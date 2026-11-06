const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    targetType: { type: String, enum: ["video", "live", "user"], required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    reason: { type: String, required: true },
    status: { type: String, enum: ["pending", "reviewed", "dismissed"], default: "pending" },
    // Optional origin context for reports filed by an authorized agency
    // supervisor. Existing user reports keep this field absent.
    agencyContext: {
      liveId: { type: mongoose.Schema.Types.ObjectId, ref: "Live" },
      agencyId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      creatorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      category: { type: String, enum: ["commercial_sex", "grooming", "off_platform", "external_payment", "harassment", "fraud", "other"] },
      observedRole: { type: String, enum: ["host", "viewer", "guest"] },
    },
  },
  { timestamps: true }
);

// Bounds per-reporter incident lookups and the durable agency spam quota.
reportSchema.index({ reporter: 1, createdAt: -1 });
module.exports = mongoose.model("Report", reportSchema);
