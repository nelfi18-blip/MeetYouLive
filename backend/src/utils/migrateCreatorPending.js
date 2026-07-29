/**
 * One-time migration: convert legacy `creator_pending` role documents
 * to the new structure (role: "user", creatorStatus: "pending").
 * If a legacy document already carries approval evidence, preserve creator
 * access instead of downgrading it during startup.
 *
 * This runs at server startup via index.js so that any documents that
 * were written before the Phase-1 role refactor are updated automatically.
 */

const mongoose = require("mongoose");

async function migrateCreatorPending() {
  try {
    const result = await mongoose.connection
      .collection("users")
      .bulkWrite([
        {
          updateMany: {
            filter: {
              role: "creator_pending",
              $or: [
                { creatorStatus: "approved" },
                { isVerifiedCreator: true },
                { creatorApprovedAt: { $ne: null } },
                { "creatorApplication.reviewDecision": "approved" },
              ],
            },
            update: {
              $set: {
                role: "creator",
                creatorStatus: "approved",
                isVerifiedCreator: true,
              },
              $unset: { creatorRequest: "" },
            },
          },
        },
        {
          updateMany: {
            filter: {
              role: "creator_pending",
              creatorStatus: { $ne: "approved" },
              isVerifiedCreator: { $ne: true },
              creatorApprovedAt: null,
              "creatorApplication.reviewDecision": { $ne: "approved" },
            },
            update: { $set: { role: "user", creatorStatus: "pending" }, $unset: { creatorRequest: "" } },
          },
        },
      ]);

    if (result.modifiedCount > 0) {
      console.log(
        `✅ Migración: ${result.modifiedCount} usuario(s) de creator_pending normalizados preservando aprobaciones`
      );
    }
  } catch (error) {
    console.error("⚠️  migrateCreatorPending error:", error.message);
  }
}

module.exports = migrateCreatorPending;
