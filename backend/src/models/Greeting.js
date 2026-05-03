const mongoose = require("mongoose");

const greetingSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    message: { type: String, default: "👋" }, // Default wave emoji
    // Flag to track if the greeting has been viewed
    viewed: { type: Boolean, default: false },
    viewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Index for querying greetings received by a user
greetingSchema.index({ to: 1, viewed: 1, createdAt: -1 });
greetingSchema.index({ from: 1, createdAt: -1 });

module.exports = mongoose.model("Greeting", greetingSchema);
