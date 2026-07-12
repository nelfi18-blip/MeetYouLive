const mongoose = require("mongoose");

const guestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    joinedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ["active", "disconnected"], default: "active" },
  },
  { _id: false }
);

const guestRequestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    requestedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ["pending", "approved", "declined"], default: "pending" },
  },
  { _id: false }
);

const topSupporterSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    username: { type: String },
    totalCoins: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const liveModerationActionSchema = new mongoose.Schema(
  {
    moderator: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    target: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, enum: ["kick", "ban"], required: true },
    reason: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// userComboSchema: Documents the structure of combo entries stored in the userCombos Map.
// IMPORTANT: Mongoose Maps with "of: schema" do NOT enforce validation on Map values.
// The schema definition here serves ONLY as developer documentation for the expected structure.
// At runtime, Map values are stored as plain objects without schema validation or type coercion.
// userId is stored as String to match the Map key type (avoids ObjectId serialization issues).
const userComboSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    username: { type: String },
    comboCount: { type: Number, default: 1, min: 1 },
    lastGiftAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const liveSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    description: { type: String },
    streamKey: { type: String, required: true, unique: true },
    category: { type: String, default: "" },
    language: { type: String, default: "" },
    isLive: { type: Boolean, default: false },
    viewerCount: { type: Number, default: 0 },
    endedAt: { type: Date },
    isPrivate: { type: Boolean, default: false },
    isVipOnly: { type: Boolean, default: false },
    entryCost: { type: Number, default: 0, min: 0 },
    paidViewers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    chatEnabled: { type: Boolean, default: true },
    giftsEnabled: { type: Boolean, default: true },
    // Multi-guest streaming support (Tango-style)
    guests: { type: [guestSchema], default: [] },
    guestRequests: { type: [guestRequestSchema], default: [] },
    bannedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    moderationActions: { type: [liveModerationActionSchema], default: [] },
    maxGuests: { type: Number, default: 3, min: 0, max: 10 },
    goal: {
      active:   { type: Boolean, default: false },
      title:    { type: String,  default: "" },
      target:   { type: Number,  default: 0,  min: 0 },
      progress: { type: Number,  default: 0,  min: 0 },
      reward:   { type: String,  default: "" },
    },
    battle: {
      active:     { type: Boolean, default: false },
      title:      { type: String,  default: "" },
      leftLabel:  { type: String,  default: "Equipo A" },
      rightLabel: { type: String,  default: "Equipo B" },
      leftScore:  { type: Number,  default: 0, min: 0 },
      rightScore: { type: Number,  default: 0, min: 0 },
      endsAt:     { type: Date },
    },
    topSupporter: { type: topSupporterSchema, default: null },
    // Combo tracking: map of userId -> combo state (for gift streak system)
    userCombos: { type: Map, of: userComboSchema, default: new Map() },
    // Discovery & engagement flags
    isTrending: { type: Boolean, default: false },
    // VS Battle system
    isVsActive: { type: Boolean, default: false },
    opponentId: { type: mongoose.Schema.Types.ObjectId, ref: "Live" },
    vsStartTime: { type: Date },
    vsDuration: { type: Number, default: 0, min: 0 }, // in seconds
    vsScore: {
      host: { type: Number, default: 0, min: 0 },
      opponent: { type: Number, default: 0, min: 0 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Live", liveSchema);
