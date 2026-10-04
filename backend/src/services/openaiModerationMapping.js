const { RISK_LEVELS, CATEGORIES } = require("./textModeration.service.js");

/**
 * Explicit, conservative mapping from the OpenAI Moderation API categories
 * (model `omni-moderation-latest` / `text-moderation-latest`) to the internal
 * categories defined by the #975 contract. Categories without a reliable
 * internal equivalent are intentionally omitted (never guessed), per the
 * Phase 2 requirement to not invent precision. Unmapped provider categories
 * are documented inline below.
 *
 * - "sexual"                 -> sexual
 * - "sexual/minors"          -> child_safety (always, regardless of score)
 * - "harassment"             -> harassment
 * - "harassment/threatening" -> harassment
 * - "hate"                   -> hate
 * - "hate/threatening"       -> hate
 * - "violence"               -> violence
 * - "violence/graphic"       -> violence
 * - "self-harm"              -> self_harm
 * - "self-harm/intent"       -> self_harm
 * - "self-harm/instructions" -> self_harm
 * - "illicit"                -> other (OpenAI has no scam/spam category; "illicit"
 *                               is too broad to map reliably to scam/spam, so it
 *                               is conservatively downgraded to "other")
 * - "illicit/violent"        -> violence (explicit violent-intent signal)
 *
 * OpenAI has no dedicated "scam" or "spam" category today; this adapter never
 * fabricates those categories from unrelated provider signals.
 */
const PROVIDER_CATEGORY_MAP = Object.freeze({
  sexual: "sexual",
  "sexual/minors": "child_safety",
  harassment: "harassment",
  "harassment/threatening": "harassment",
  hate: "hate",
  "hate/threatening": "hate",
  violence: "violence",
  "violence/graphic": "violence",
  "self-harm": "self_harm",
  "self-harm/intent": "self_harm",
  "self-harm/instructions": "self_harm",
  illicit: "other",
  "illicit/violent": "violence",
});

/**
 * Risk-level thresholds. These exist ONLY to prioritize human review queues;
 * they never trigger enforcement. Thresholds operate on the highest
 * `category_scores` value among the categories OpenAI flagged as true.
 *
 * - score >= 0.9                      -> critical
 * - score >= 0.7                      -> high
 * - score >= 0.4                      -> medium
 * - score > 0 (strictly positive)     -> low
 * - score === 0 (even if flagged) or nothing flagged -> safe
 *
 * The "low" threshold is intentionally EXCLUSIVE at 0 (`min: 0, exclusive:
 * true`): a flagged category whose normalized score is exactly 0 must never
 * be classified as "low" merely because an inclusive `>= 0` comparison would
 * match it. Thresholds are evaluated in order, each using `>=` against its
 * `min`, except entries explicitly marked `exclusive: true`, which require
 * `>` instead.
 *
 * A flagged "sexual/minors" category always forces at least "critical",
 * regardless of its numeric score (including exactly 0), because of the
 * sensitivity of that signal for prioritizing human review (never for
 * automated action).
 */
const RISK_THRESHOLDS = Object.freeze([
  { level: "critical", min: 0.9 },
  { level: "high", min: 0.7 },
  { level: "medium", min: 0.4 },
  { level: "low", min: 0, exclusive: true },
]);

function clampScore(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * @param {Record<string, boolean>} categories OpenAI `categories` object
 * @param {Record<string, number>} categoryScores OpenAI `category_scores` object
 * @returns {{ riskLevel: string, categories: string[], scores: Record<string, number> }}
 */
function mapProviderResult(categories = {}, categoryScores = {}) {
  const flaggedProviderKeys = Object.keys(PROVIDER_CATEGORY_MAP)
    .filter((providerKey) => categories?.[providerKey] === true);

  if (flaggedProviderKeys.length === 0) {
    return { riskLevel: "safe", categories: [], scores: {} };
  }

  const internalScores = {};
  let maxScore = 0;
  let forceCritical = false;

  for (const providerKey of flaggedProviderKeys) {
    const internalCategory = PROVIDER_CATEGORY_MAP[providerKey];
    const score = clampScore(categoryScores?.[providerKey]);
    if (!(internalCategory in internalScores) || score > internalScores[internalCategory]) {
      internalScores[internalCategory] = score;
    }
    if (score > maxScore) maxScore = score;
    if (providerKey === "sexual/minors") forceCritical = true;
  }

  const internalCategories = Object.keys(internalScores).filter((category) =>
    CATEGORIES.includes(category)
  );

  const matchedThreshold = RISK_THRESHOLDS.find((threshold) =>
    threshold.exclusive ? maxScore > threshold.min : maxScore >= threshold.min
  );
  let riskLevel = matchedThreshold ? matchedThreshold.level : "safe";
  if (forceCritical) riskLevel = "critical";
  if (!RISK_LEVELS.includes(riskLevel)) riskLevel = "low";

  return { riskLevel, categories: internalCategories, scores: internalScores };
}

module.exports = {
  PROVIDER_CATEGORY_MAP,
  RISK_THRESHOLDS,
  mapProviderResult,
};
