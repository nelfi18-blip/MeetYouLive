const mongoose = require("mongoose");

/**
 * UserMissions – one document per user per UTC calendar day.
 * Tracks progress and reward status for each daily mission.
 *
 * Mission IDs are fixed and match MISSION_DEFINITIONS in missions.service.js:
 *   likes_10  – give 10 likes today
 *   chat_1    – start 1 chat (send a message)
 *   live_1    – join 1 live stream
 *   gift_1    – send 1 gift
 */
const missionProgressSchema = new mongoose.Schema(
  {
    count: { type: Number, default: 0, min: 0 },
    rewarded: { type: Boolean, default: false },
  },
  { _id: false }
);

const userMissionsSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: String, required: true }, // "YYYY-MM-DD" UTC
    progress: {
      likes_10: { type: missionProgressSchema, default: () => ({}) },
      chat_1: { type: missionProgressSchema, default: () => ({}) },
      live_1: { type: missionProgressSchema, default: () => ({}) },
      gift_1: { type: missionProgressSchema, default: () => ({}) },
    },
    bonusRewarded: { type: Boolean, default: false }, // set when all 4 missions completed
  },
  { timestamps: true }
);

// Compound unique index: one document per user per day
userMissionsSchema.index({ userId: 1, date: 1 }, { unique: true });

const UserMissions = mongoose.model("UserMissions", userMissionsSchema);

module.exports = UserMissions;
