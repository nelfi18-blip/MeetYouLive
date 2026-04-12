const mongoose = require("mongoose");

const CATEGORIES = ["confianza_amor", "rompe_hielo", "consejos_citas", "mala_suerte_amor"];

const socialRoomSchema = new mongoose.Schema(
  {
    category: { type: String, enum: CATEGORIES, required: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    host: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    moderators: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    highlightedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    isActive: { type: Boolean, default: true },
    messageCount: { type: Number, default: 0 },
    activeUserCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

socialRoomSchema.statics.CATEGORIES = CATEGORIES;

module.exports = mongoose.model("SocialRoom", socialRoomSchema);
