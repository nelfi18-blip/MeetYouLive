const { z } = require("zod");

const MAX_TEXT_LENGTH = 5000;
const RISK_LEVELS = Object.freeze(["safe", "low", "medium", "high", "critical"]);
const CATEGORIES = Object.freeze([
  "harassment", "hate", "sexual", "violence", "self_harm",
  "scam", "spam", "child_safety", "other",
]);
const CONTEXTS = Object.freeze([
  "chat_message", "live_message", "room_message", "profile_text",
]);

const inputSchema = z.object({
  context: z.enum(CONTEXTS),
  text: z.string().min(1).max(MAX_TEXT_LENGTH).refine((text) => text.trim().length > 0),
}).strict();

const probabilitySchema = z.number().finite().min(0).max(1);
const classificationSchema = z.object({
  status: z.literal("evaluated"),
  riskLevel: z.enum(RISK_LEVELS),
  categories: z.array(z.enum(CATEGORIES)).max(CATEGORIES.length)
    .refine((categories) => new Set(categories).size === categories.length),
  confidence: probabilitySchema.optional(),
  scores: z.record(z.enum(CATEGORIES), probabilitySchema).optional(),
}).strict().refine(
  ({ riskLevel, categories }) => riskLevel === "safe"
    ? categories.length === 0
    : categories.length > 0
);

const providerResultSchema = z.union([
  classificationSchema,
  z.object({ status: z.literal("provider_unavailable") }).strict(),
]);
const TIMEOUT = Symbol("provider timeout");

/**
 * Internal detection only. Adapters receive text and an AbortSignal, never a
 * request/user object. No database, reporting, socket or enforcement dependencies.
 */
function createTextModerationService({ provider = null, timeoutMs = 2000 } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000) {
    throw new TypeError("Invalid text moderation timeout");
  }
  if (provider !== null && (
    !z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).safeParse(provider.name).success
    || typeof provider.evaluateText !== "function"
  )) {
    throw new TypeError("Invalid text moderation provider");
  }
  const providerName = provider === null ? null : provider.name;

  async function evaluateText(input) {
    const parsedInput = inputSchema.safeParse(input);
    if (!parsedInput.success) {
      throw new TypeError("Invalid text moderation input");
    }

    const metadata = {
      context: parsedInput.data.context,
      provider: providerName,
      createdAt: new Date().toISOString(),
    };
    const unevaluated = (status) => ({
      ...metadata, status, riskLevel: null, categories: [],
    });
    if (provider === null) return unevaluated("not_configured");

    const controller = new AbortController();
    let timer;
    try {
      const result = await Promise.race([
        Promise.resolve().then(() => provider.evaluateText(
          { text: parsedInput.data.text },
          { signal: controller.signal }
        )),
        new Promise((resolve) => {
          timer = setTimeout(() => resolve(TIMEOUT), timeoutMs);
        }),
      ]);
      if (result === TIMEOUT) {
        controller.abort();
        return unevaluated("timeout");
      }

      const parsedResult = providerResultSchema.safeParse(result);
      if (!parsedResult.success) return unevaluated("invalid_result");
      if (parsedResult.data.status === "provider_unavailable") {
        return unevaluated("provider_unavailable");
      }
      return { ...metadata, ...parsedResult.data };
    } catch {
      // Provider failures must not expose error bodies or masquerade as safe.
      return unevaluated("provider_error");
    } finally {
      clearTimeout(timer);
    }
  }

  return Object.freeze({ evaluateText });
}

const { evaluateText } = createTextModerationService();

module.exports = {
  createTextModerationService,
  evaluateText,
  MAX_TEXT_LENGTH,
  RISK_LEVELS,
  CATEGORIES,
  CONTEXTS,
};
