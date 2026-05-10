const mongoose = require("mongoose");

const sparkTransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: [
        "purchase",
        "boost_used",
        "pass_purchase",
        "match_boost",
        "speed_dating",
        "room_entry",
        "admin_adjustment",
      ],
      required: true,
    },
    amount: { type: Number, required: true },
    reason: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "completed",
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// Unique index on stripeSessionId to prevent duplicate payment processing
sparkTransactionSchema.index({ "metadata.stripeSessionId": 1 }, { unique: true, sparse: true });

const SparkTransaction = mongoose.model("SparkTransaction", sparkTransactionSchema);

module.exports = SparkTransaction;
