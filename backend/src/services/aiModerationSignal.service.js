const AIModerationSignal = require("../models/AIModerationSignal.js");

const DUPLICATE_KEY_ERROR_CODE = 11000;

/**
 * Persists an AI moderation signal ONLY when human review is actually
 * warranted. This function never enforces anything; it only records
 * metadata for staff review.
 *
 * Persistence rules (Phase 2):
 * - `evaluation.status !== "evaluated"` -> nothing persisted. Unevaluated
 *   statuses (`not_configured`, `provider_unavailable`, `provider_error`,
 *   `invalid_result`, `timeout`) are not findings; there is nothing to
 *   review and persisting them would just be unreviewable noise.
 * - `evaluation.riskLevel === "safe"` -> nothing persisted. Safe text does
 *   not need human review.
 * - Any other risk level (`low`, `medium`, `high`, `critical`) -> persisted
 *   with minimal metadata (never the original text, never the raw
 *   provider request/response).
 * - Duplicate (sourceType, sourceId) pairs are ignored (protects against
 *   accidental double-evaluation of the same content, e.g. retried calls).
 *
 * @param {object} params
 * @param {string} params.context one of the #975 CONTEXTS
 * @param {string} params.sourceType one of AIModerationSignal.SOURCE_TYPES
 * @param {string} params.sourceId id of the original content (e.g. Message._id)
 * @param {string} params.userId id of the content's author
 * @param {object} params.evaluation result of textModeration evaluateText()
 * @returns {Promise<object|null>} the created signal, or null if not persisted
 */
async function recordAIModerationSignal({ context, sourceType, sourceId, userId, evaluation }) {
  if (!evaluation || evaluation.status !== "evaluated") return null;
  if (evaluation.riskLevel === "safe") return null;
  if (!sourceType || !sourceId || !userId) return null;

  try {
    return await AIModerationSignal.create({
      context,
      sourceType,
      sourceId,
      userId,
      provider: evaluation.provider,
      riskLevel: evaluation.riskLevel,
      categories: evaluation.categories,
      ...(typeof evaluation.confidence === "number" ? { confidence: evaluation.confidence } : {}),
      ...(evaluation.scores ? { scores: evaluation.scores } : {}),
    });
  } catch (err) {
    if (err?.code === DUPLICATE_KEY_ERROR_CODE) return null;
    // AI moderation persistence must never break the caller's principal
    // operation; the content has already been published/sent by this point.
    return null;
  }
}

module.exports = { recordAIModerationSignal };
