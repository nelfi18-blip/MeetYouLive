const mongoose = require("mongoose");

const likeSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    to:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    crushType: {
      type: String,
      enum: ["standard", "super_crush"],
      default: "standard",
    },
  },
  { timestamps: true }
);

// Unique compound index: a user can only like another user once.
// This prevents duplicate match records and makes the operation idempotent.
likeSchema.index({ from: 1, to: 1 }, { unique: true });
likeSchema.index({ to: 1, crushType: 1 });

module.exports = mongoose.model("Like", likeSchema);
