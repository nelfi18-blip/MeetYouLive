const mongoose = require("mongoose");
const {
  RISK_LEVELS, CATEGORIES, CONTEXTS,
} = require("../services/textModeration.service.js");

// Risk levels that are actually persisted for human review. "safe" is
// intentionally excluded: safe text never produces a durable signal.
const PERSISTABLE_RISK_LEVELS = Object.freeze(
  RISK_LEVELS.filter((level) => level !== "safe")
);

const REVIEW_STATUSES = Object.freeze(["pending", "reviewed", "dismissed"]);

// Source surfaces this model can reference. Phase 2 only wires chat
// messages; the enum stays narrow and must be extended deliberately.
const SOURCE_TYPES = Object.freeze(["message"]);

/**
 * Minimal, auditable record of an AI moderation signal that requires human
 * review. This model NEVER performs enforcement by itself and NEVER stores
 * the original message text, the raw provider request, or the raw provider
 * response. It only stores metadata sufficient for staff to locate and
 * review the original content: a reference (`sourceType` + `sourceId`), not
 * a copy of it.
 *
 * AI detects → records/flags → human reviews → the existing moderation
 * system (Report/User.isBlocked/isSuspended) decides. This model is not a
 * substitute for Report and never fabricates a human reporter.
 */
const aiModerationSignalSchema = new mongoose.Schema(
  {
    context: { type: String, enum: CONTEXTS, required: true },
    sourceType: { type: String, enum: SOURCE_TYPES, required: true },
    sourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    // Author of the original content, so staff can investigate without
    // storing the content itself.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    provider: { type: String, required: true, maxlength: 64 },
    riskLevel: { type: String, enum: PERSISTABLE_RISK_LEVELS, required: true },
    categories: {
      type: [{ type: String, enum: CATEGORIES }],
      default: [],
      validate: {
        validator: (categories) => Array.isArray(categories) && categories.length > 0,
        message: "AIModerationSignal requires at least one category",
      },
    },
    confidence: { type: Number, min: 0, max: 1 },
    // Category-keyed provider scores, never raw provider payloads.
    scores: { type: Map, of: Number, default: undefined },
    status: { type: String, enum: REVIEW_STATUSES, default: "pending", required: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Guard against duplicate signals for the same evaluated source (e.g. a
// retried emit or duplicated background evaluation of the same message).
aiModerationSignalSchema.index({ sourceType: 1, sourceId: 1 }, { unique: true });
aiModerationSignalSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("AIModerationSignal", aiModerationSignalSchema);
module.exports.PERSISTABLE_RISK_LEVELS = PERSISTABLE_RISK_LEVELS;
module.exports.REVIEW_STATUSES = REVIEW_STATUSES;
module.exports.SOURCE_TYPES = SOURCE_TYPES;
