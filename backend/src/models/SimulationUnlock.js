const mongoose = require("mongoose");

const simulationUnlockSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    scenarioId: { type: String, required: true },
    coinsSpent: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

simulationUnlockSchema.index({ user: 1, scenarioId: 1 }, { unique: true });

module.exports = mongoose.model("SimulationUnlock", simulationUnlockSchema);
