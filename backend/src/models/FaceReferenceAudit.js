const mongoose = require("mongoose");

/**
 * FaceReferenceAudit — append-only, NON-biometric audit trail for every
 * face-reference lifecycle event (created/matched/mismatch/review/error/
 * revoked/expired/consent_denied). Satisfies the "auditoría sin datos
 * biométricos" requirement: only outcomes/reason codes and hashed/opaque
 * identifiers are recorded, never images, videos, or similarity scores tied
 * to a specific face.
 */
const faceReferenceAuditSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    action: {
      type: String,
      enum: [
        "created",
        "matched",
        "mismatch",
        "review",
        "error",
        "revoked",
        "expired",
        "consent_denied",
        "no_reference",
        "unavailable",
      ],
      required: true,
    },
    reasonCode: { type: String, default: "" },
    ipHash: { type: String, default: "" },
  },
  { timestamps: true }
);

// Keep the audit trail itself bounded — it is diagnostic/compliance history,
// not a permanent biometric record, and holds no biometric data to begin with.
faceReferenceAuditSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 400 });

module.exports = mongoose.model("FaceReferenceAudit", faceReferenceAuditSchema);
