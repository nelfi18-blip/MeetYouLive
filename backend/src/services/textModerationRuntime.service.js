const { createTextModerationService } = require("./textModeration.service.js");
const { createOpenAIModerationProvider } = require("./openaiModeration.adapter.js");

/**
 * Production-wired instance of the #975 text moderation service, configured
 * with the OpenAI adapter when `OPENAI_API_KEY` is set. When the key is
 * absent, `createOpenAIModerationProvider()` returns `null` and this module
 * behaves exactly like the unconfigured default export of
 * `textModeration.service.js`: zero outbound calls, status `not_configured`.
 *
 * This module exists separately from `textModeration.service.js`'s own
 * default export so that the foundational service stays provider-agnostic
 * and testable in isolation, while callers that want the real (or
 * not-configured) production provider use this module instead.
 */
const { evaluateText } = createTextModerationService({
  provider: createOpenAIModerationProvider(),
});

module.exports = { evaluateText };
