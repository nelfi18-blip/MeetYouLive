const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema(
  {
    participants: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    ],
    lastMessage: {
      text: { type: String },
      createdAt: { type: Date },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Chat", chatSchema);
