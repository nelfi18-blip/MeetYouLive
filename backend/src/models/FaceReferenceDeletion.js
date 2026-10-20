const mongoose = require("mongoose");

/**
 * FaceReferenceDeletion — a fully independent, immutable record of a single
 * AWS Rekognition face vector that must be deleted ("Perfil Auténtico").
 *
 * This is intentionally a SEPARATE collection from FaceReference, not a set
 * of fields reused on the same per-user document. FaceReference documents
 * are upserted/reused across the lifetime of a user (e.g. replacing an old
 * reference with a new one right after a fresh approved selfie). If pending
 * deletion bookkeeping lived on that same, reusable document, a later
 * creation/replacement could race with — or silently clobber — an older
 * deletion's tracking fields (status, consent, FaceId), or lose track of a
 * vector that still needs to be deleted from AWS. By persisting each
 * deletion as its OWN document the moment it is scheduled, with its
 * `collectionId`/`encryptedFaceId` captured immutably at creation time, a
 * new FaceReference being created/replaced for the same user can NEVER
 * affect, overwrite, or lose track of an already-scheduled deletion — and
 * two concurrent deletions (e.g. a double revoke, or revoke racing a
 * replace) can never corrupt each other's state.
 */
const faceReferenceDeletionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // Captured once, at creation time, from the FaceReference document being
    // retired — never mutated afterward (immutable: true rejects any
    // accidental future $set on these two fields at the schema level).
    collectionId: { type: String, required: true, immutable: true },
    encryptedFaceId: { type: String, required: true, immutable: true },
    reason: {
      type: String,
      // "orphaned_index" covers a FaceId that AWS IndexFaces created but
      // that never ended up attached to a successfully-saved FaceReference
      // document (e.g. the Mongo write failed AND the synchronous AWS
      // compensation delete also failed) — it never belonged to an "active"
      // FaceReference document in the first place, so it is tracked here
      // directly instead of via a retire/replace of an existing one.
      enum: ["revoked", "expired", "replaced", "account_deleted", "orphaned_index"],
      required: true,
    },
    status: { type: String, enum: ["pending", "confirmed", "failed"], default: "pending", index: true },
    attempts: { type: Number, default: 0 },
    lastAttemptAt: { type: Date, default: null },
    lastError: { type: String, default: "" },
    confirmedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("FaceReferenceDeletion", faceReferenceDeletionSchema);
