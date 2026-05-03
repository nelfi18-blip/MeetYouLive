const mongoose = require("mongoose");

const userVisitSchema = new mongoose.Schema(
  {
    visitor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    visited: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // Track multiple visits
    visitCount: { type: Number, default: 1, min: 1 },
    lastVisitAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Unique compound index: one visit record per visitor-visited pair
userVisitSchema.index({ visitor: 1, visited: 1 }, { unique: true });
// Index for querying visits received by a user
userVisitSchema.index({ visited: 1, lastVisitAt: -1 });

module.exports = mongoose.model("UserVisit", userVisitSchema);
