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
    suspendedAt: { type: Date, default: null },
    removedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Enforce uniqueness: one sub-creator may only have one active record per parent.
// A sub-creator can only belong to one parent total (enforced at controller level).
agencyRelationshipSchema.index({ subCreator: 1 }, { unique: true, sparse: false });

const AgencyRelationship = mongoose.model("AgencyRelationship", agencyRelationshipSchema);

module.exports = AgencyRelationship;
