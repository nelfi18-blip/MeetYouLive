const mongoose = require("mongoose");

/**
 * FaceReference — the reusable, encrypted facial reference for "Perfil
 * Auténtico" (same verification system as PhotoVerificationSession; this is
 * NOT a second verification system). One document per user, created ONLY
 * after an approved selfie verification AND explicit, separate consent to
 * keep a reference for future primary-photo comparisons.
 *
 * Biometric-data minimization:
 *   - No selfie image, video, or raw biometric template/vector is ever
 *     stored here (or anywhere in MeetYouLive's database).
 *   - `encryptedFaceId` holds only an AES-256-GCM-encrypted copy of the
 *     OPAQUE FaceId Rekognition returns from IndexFaces — a pointer into
 *     AWS's managed Collection, not a usable face image or vector by itself.
 *   - `sourcePhotoHash` is a one-way SHA-256 digest of the selfie reference
 *     bytes used at creation time, kept ONLY to detect duplicate/replay
 *     indexing attempts — never useful to reconstruct the image.
 */
const faceReferenceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    collectionId: { type: String, required: true },
    encryptedFaceId: { type: String, required: true },
    sourcePhotoHash: { type: String, default: "" },
    status: {
      type: String,
      enum: ["active", "revoked", "pending_deletion", "expired"],
      default: "active",
      index: true,
    },
    consentedAt: { type: Date, required: true },
    consentWithdrawnAt: { type: Date, default: null },
    // Limited retention: this reference must never be used for a comparison
    // once past this date, even if `status` is still "active".
    retentionExpiresAt: { type: Date, required: true },
    lastUsedAt: { type: Date, default: null },
    // AWS-side deletion tracking. The LOCAL record is marked
    // "pending_deletion"/"expired" the moment the user withdraws consent or
    // the retention window lapses (so it can never be reused for a
    // comparison again), but we never tell the user the biometric data is
    // FULLY gone until AWS's DeleteFaces call is confirmed — if it fails,
    // these fields let a retry job find and finish the job safely.
    deletionPending: { type: Boolean, default: false, index: true },
    deletionConfirmedAt: { type: Date, default: null },
    deletionAttempts: { type: Number, default: 0 },
    lastDeletionAttemptAt: { type: Date, default: null },
    lastDeletionError: { type: String, default: "" },
    // The exact collectionId/encryptedFaceId that still needs deleting from
    // AWS, captured at the moment deletion is requested — kept independent
    // of whatever becomes of the main record afterwards (e.g. a brand-new
    // reference being created) so a retry never targets the wrong face.
    pendingDeleteCollectionId: { type: String, default: "" },
    pendingDeleteEncryptedFaceId: { type: String, default: "" },
    // The terminal status to settle into once AWS confirms the deletion
    // above — "revoked" (consent withdrawn) or "expired" (retention lapsed).
    // Persisted explicitly (not inferred) so the retry job can re-fetch this
    // document fresh from the DB on a later run and still know the correct
    // terminal state to apply, without re-deriving it incorrectly.
    postDeletionStatus: { type: String, enum: ["revoked", "expired"], default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("FaceReference", faceReferenceSchema);
