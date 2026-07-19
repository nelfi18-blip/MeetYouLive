const mongoose = require("mongoose");

const dislikeSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

dislikeSchema.index({ from: 1, to: 1 }, { unique: true });

module.exports = mongoose.model("Dislike", dislikeSchema);
