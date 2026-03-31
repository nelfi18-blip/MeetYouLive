/**
 * One-time migration: convert legacy `creator_pending` role documents
 * to the new structure (role: "user", creatorStatus: "pending").
 *
 * This runs at server startup via index.js so that any documents that
 * were written before the Phase-1 role refactor are updated automatically.
 */

const mongoose = require("mongoose");

async function migrateCreatorPending() {
  try {
    const result = await mongoose.connection
      .collection("users")
      .updateMany(
        { role: "creator_pending" },
        { $set: { role: "user", creatorStatus: "pending" }, $unset: { creatorRequest: "" } }
      );

    if (result.modifiedCount > 0) {
      console.log(
        `✅ Migración: ${result.modifiedCount} usuario(s) de creator_pending → user/pending`
      );
    }
  } catch (error) {
    console.error("⚠️  migrateCreatorPending error:", error.message);
  }
}

module.exports = migrateCreatorPending;
