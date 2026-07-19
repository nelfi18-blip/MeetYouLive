const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    chat: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, maxlength: 2000 },
    clientMessageId: { type: String, trim: true, maxlength: 128 },
  },
  { timestamps: true }
);

messageSchema.index({ chat: 1, createdAt: 1 });
messageSchema.index(
  { chat: 1, sender: 1, clientMessageId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      clientMessageId: { $exists: true, $type: "string", $ne: "" },
    },
  }
);

module.exports = mongoose.model("Message", messageSchema);
