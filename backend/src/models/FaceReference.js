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
 *
 * Deletion tracking lives ENTIRELY in the separate FaceReferenceDeletion
 * collection (see that model), never as fields on this document. This
 * document only ever needs to be transitioned directly between its
 * terminal-for-reuse-purposes states ("active" <-> "revoked"/"expired");
 * whatever vector needs deleting from AWS as a RESULT of that transition is
 * captured into its own independent FaceReferenceDeletion record at the
 * moment of transition, so reusing/upserting THIS document for a brand-new
 * reference later can never affect, corrupt, or lose track of that deletion.
 */
const faceReferenceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    collectionId: { type: String, required: true },
    encryptedFaceId: { type: String, required: true },
    sourcePhotoHash: { type: String, default: "" },
    status: {
      type: String,
      enum: ["active", "revoked", "expired"],
      default: "active",
      index: true,
    },
    consentedAt: { type: Date, required: true },
    consentWithdrawnAt: { type: Date, default: null },
    // Limited retention: this reference must never be used for a comparison
    // once past this date, even if `status` is still "active".
    retentionExpiresAt: { type: Date, required: true },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("FaceReference", faceReferenceSchema);
