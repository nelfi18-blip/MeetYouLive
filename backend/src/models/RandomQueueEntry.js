const mongoose = require("mongoose");

// Minimal waiting-queue entry for the Random 1:1 matchmaking module.
// One document per user currently waiting to be matched. The unique index on
// `user` is what makes POST /api/random/join idempotent and safe across
// multiple backend instances: a second join attempt simply upserts the same
// document instead of creating a duplicate queue entry.
const randomQueueEntrySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

module.exports = mongoose.model("RandomQueueEntry", randomQueueEntrySchema);
