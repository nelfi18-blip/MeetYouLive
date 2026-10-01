const mongoose = require("mongoose");

// Random 1:1 matchmaking session. Phase 1 only — no economy, no Agora data.
// Keeps exactly the minimal fields needed to track a WAITING → MATCHED →
// ENDED lifecycle (WAITING itself has no document; it is represented solely
// by a RandomQueueEntry).
const randomSessionSchema = new mongoose.Schema(
  {
    participants: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      required: true,
      validate: {
        validator: (value) => Array.isArray(value) && value.length === 2,
        message: "RandomSession.participants must contain exactly 2 user ids",
      },
    },
    status: {
      type: String,
      enum: ["matched", "ended"],
      default: "matched",
    },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    endedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    endReason: {
      type: String,
      enum: ["leave", "next", null],
      default: null,
    },
  },
  { timestamps: true }
);

// Mirrors the VideoCall.activeParticipantIds pattern: a partial unique index
// over the (multikey) participants array guarantees — at the database level,
// across all backend instances — that no user id can appear in more than one
// "matched" session at a time. This is the last line of defense against the
// concurrency bugs this module must avoid (double-matching, duplicate
// sessions), on top of the transactional matching logic in random.service.js.
randomSessionSchema.index(
  { participants: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "matched" },
  }
);

module.exports = mongoose.model("RandomSession", randomSessionSchema);
