const mongoose = require("mongoose");

// Separate model for agency relationships — supports admin approval workflow,
// percentage-change audit trail, and one-level-only enforcement.
const agencyRelationshipSchema = new mongoose.Schema(
  {
    parentCreator: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    subCreator: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    percentage: { type: Number, required: true, min: 5, max: 30 },
    status: {
      type: String,
      enum: ["pending", "active", "suspended", "removed"],
      default: "pending",
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    approvedAt: { type: Date, default: null },
    percentageHistory: [
      {
        percentage: Number,
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        changedAt: { type: Date, default: Date.now },
        _id: false,
      },
    ],
    subCreatorAgreed: { type: Boolean, default: false },
    subCreatorAgreedAt: { type: Date, default: null },
    suspendedAt: { type: Date, default: null },
    removedAt: { type: Date, default: null },
    notes: { type: String, default: "" },
    // Percentage-change proposal: a parent creator (or admin) may propose a new
    // commission percentage for an active relationship, but it never takes effect
    // until the sub-creator explicitly accepts it. `percentage` above keeps the
    // previously agreed value in force in the meantime (no unilateral changes).
    pendingPercentage: { type: Number, default: null, min: 5, max: 30 },
    pendingPercentageProposedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    pendingPercentageProposedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Partial unique index: a subCreator may only have one non-removed link at a time.
// Only "removed" records are excluded so a new link can be created after full removal.
agencyRelationshipSchema.index(
  { subCreator: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["pending", "active", "suspended"] } },
    name: "unique_active_pending_subCreator",
  }
);

agencyRelationshipSchema.index({ status: 1 });

const AgencyRelationship = mongoose.model("AgencyRelationship", agencyRelationshipSchema);

module.exports = AgencyRelationship;
