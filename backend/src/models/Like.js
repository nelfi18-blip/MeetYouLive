const mongoose = require("mongoose");

const likeSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    to:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// Unique compound index: a user can only like another user once.
// This prevents duplicate match records and makes the operation idempotent.
likeSchema.index({ from: 1, to: 1 }, { unique: true });

module.exports = mongoose.model("Like", likeSchema);
