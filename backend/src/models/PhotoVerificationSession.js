const mongoose = require("mongoose");

/**
 * PhotoVerificationSession — ephemeral bookkeeping for a single "Verificar mi
 * foto" attempt. This document NEVER stores selfie images/video, documents, or
 * biometric templates — only the minimal state needed to prevent reuse/abuse
 * and to render a result. The AWS Rekognition Liveness session itself holds
 * the transient captured media on AWS's side and is retrieved at most once by
 * the backend to run CompareFaces; MeetYouLive does not persist it.
 *
 * Documents expire automatically (TTL index) shortly after completion/expiry
 * so no verification bookkeeping lingers longer than necessary.
 */
const photoVerificationSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // Opaque session id returned by Rekognition's CreateFaceLivenessSession.
    rekognitionSessionId: { type: String, required: true },
    // Snapshot of the primary photo URL used for this attempt, so we can
    // detect (and block/invalidate) a primary-photo change mid-flight.
    primaryPhotoAtStart: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "processing", "verified", "failed", "review", "expired"],
      default: "pending",
    },
    // Set only while the atomic pending->processing transition owns this
    // session, so concurrent /complete calls can never both proceed past the
    // CompareFaces step (see photoVerification.service.js).
    processingStartedAt: { type: Date, default: null },
    // Explicit consent to process facial data for this attempt (required by
    // the start endpoint before a session is ever created).
    consentedAt: { type: Date, required: true },
    // SEPARATE, optional consent: if true AND this session ends "verified",
    // the selfie reference image (already in memory for this request only)
    // is indexed once into the reusable face-reference system so a later
    // primary-photo change can be re-checked without a new selfie. Declining
    // this never blocks verification itself — see faceReference.service.js.
    keepReferenceConsent: { type: Boolean, default: false },
    // Result summary only — never the underlying images.
    result: {
      livenessConfidence: { type: Number, default: null },
      similarity: { type: Number, default: null },
      reasonCode: { type: String, default: "" },
    },
    completedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
    ipHash: { type: String, default: "" },
  },
  { timestamps: true }
);

// Auto-delete sessions well after they expire — we only need them briefly for
// anti-reuse/anti-abuse checks, never as a long-term record.
photoVerificationSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

module.exports = mongoose.model("PhotoVerificationSession", photoVerificationSessionSchema);
