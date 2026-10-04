const { mapProviderResult } = require("./openaiModerationMapping.js");

const DEFAULT_MODEL = "omni-moderation-latest";
const ENDPOINT = "https://api.openai.com/v1/moderations";
const NAME = "openai_moderation";

/**
 * OpenAI Moderation adapter satisfying the #975 provider interface exactly:
 * `{ name, evaluateText({ text }, { signal }) }`. Uses Node 24's native
 * `fetch`; no `openai` SDK dependency is added.
 *
 * Configuration is environment-only:
 * - `OPENAI_API_KEY` (required to activate the adapter at all)
 * - `OPENAI_MODERATION_MODEL` (optional override; defaults to the official
 *   OpenAI Moderation model `omni-moderation-latest`)
 *
 * If no API key is configured this factory returns `null` so the caller
 * passes `provider: null` into `createTextModerationService`, which already
 * guarantees the `not_configured` status and zero outbound calls — this
 * adapter never makes a network request to "discover" whether it is usable.
 *
 * The API key is only ever placed in the `Authorization` header of the
 * outbound request. It is never logged, returned, or persisted. OpenAI
 * response bodies (success or error) are never logged in full and never
 * echoed back to callers; only the mapped, schema-validated classification
 * leaves this module.
 */
function createOpenAIModerationProvider({
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_MODERATION_MODEL || DEFAULT_MODEL,
  fetchImpl = typeof fetch === "function" ? fetch : undefined,
} = {}) {
  if (typeof apiKey !== "string" || !apiKey.trim()) return null;
  if (typeof fetchImpl !== "function") return null;

  async function evaluateText({ text }, { signal } = {}) {
    let response;
    try {
      response = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + apiKey,
        },
        body: JSON.stringify({ model, input: text }),
        signal,
      });
    } catch {
      // Network failure, connection refused, or abort: provider is
      // unavailable. Never log the underlying error (it may include
      // request details); only the normalized contract status is returned.
      return { status: "provider_unavailable" };
    }

    if (!response.ok) {
      // Covers 429 (rate limited), 5xx (server error) and any other
      // non-2xx status. The response body is intentionally never read or
      // logged here: it can contain diagnostic details we must not retain.
      return { status: "provider_unavailable" };
    }

    const payload = await response.json();
    const result = payload?.results?.[0];
    if (!result || typeof result !== "object" || typeof result.flagged !== "boolean") {
      // Unexpected success payload shape. Thrown (not returned) so the
      // #975 service records this as `provider_error`, distinct from an
      // explicit `provider_unavailable` HTTP/network failure.
      throw new Error("Unexpected OpenAI moderation response shape");
    }

    const { riskLevel, categories, scores } = mapProviderResult(
      result.categories, result.category_scores
    );

    return {
      status: "evaluated",
      riskLevel,
      categories,
      ...(Object.keys(scores).length > 0 ? { scores } : {}),
    };
  }

  return Object.freeze({ name: NAME, evaluateText });
}

module.exports = { createOpenAIModerationProvider, DEFAULT_MODEL, NAME, ENDPOINT };
