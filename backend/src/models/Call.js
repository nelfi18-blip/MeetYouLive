const mongoose = require("mongoose");

const callSchema = new mongoose.Schema(
  {
    caller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    type: { type: String, default: "paid_creator" },

    pricePerMinute: { type: Number, required: true },

    status: {
      type: String,
      enum: ["active", "ended", "cancelled"],
      default: "active",
    },

    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date },

    totalDurationSeconds: { type: Number, default: 0 },

    totalCoinsCharged: { type: Number, default: 0 },
    creatorShare: { type: Number, default: 0 },
    platformShare: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Call", callSchema);
