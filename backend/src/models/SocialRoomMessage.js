const mongoose = require("mongoose");

const socialRoomMessageSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: "SocialRoom", required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, maxlength: 500 },
    isHighlighted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

socialRoomMessageSchema.index({ room: 1, createdAt: -1 });

module.exports = mongoose.model("SocialRoomMessage", socialRoomMessageSchema);
