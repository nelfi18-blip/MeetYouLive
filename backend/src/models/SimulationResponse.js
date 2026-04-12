const mongoose = require("mongoose");

const simulationResponseSchema = new mongoose.Schema(
  {
    scenarioId: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, maxlength: 600 },
    likesCount: { type: Number, default: 0, min: 0 },
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

simulationResponseSchema.index({ scenarioId: 1, createdAt: -1 });
simulationResponseSchema.index({ user: 1, scenarioId: 1 });

module.exports = mongoose.model("SimulationResponse", simulationResponseSchema);
