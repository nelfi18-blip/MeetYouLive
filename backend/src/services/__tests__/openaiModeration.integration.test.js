const { createTextModerationService } = require("../textModeration.service.js");
const { createOpenAIModerationProvider } = require("../openaiModeration.adapter.js");

const input = { context: "chat_message", text: "integration text" };

const flaggedBody = () => ({
  results: [{
    flagged: true,
    categories: { "sexual/minors": true },
    category_scores: { "sexual/minors": 0.2 },
  }],
});

describe("openai provider wired into the #975 text moderation service", () => {
  test("OPENAI_API_KEY absent -> not_configured, zero outbound calls", async () => {
    const fetchImpl = jest.fn();
    const provider = createOpenAIModerationProvider({ apiKey: "", fetchImpl });
    const { evaluateText } = createTextModerationService({ provider });
    const result = await evaluateText(input);
    expect(result).toMatchObject({ status: "not_configured", riskLevel: null, categories: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("valid OpenAI response produces a fully valid #975 evaluated result", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true, status: 200, json: jest.fn().mockResolvedValue(flaggedBody()),
    });
    const provider = createOpenAIModerationProvider({ apiKey: "test-token-abc", fetchImpl });
    const { evaluateText } = createTextModerationService({ provider });
    const result = await evaluateText(input);
    expect(result).toEqual({
      context: "chat_message",
      provider: "openai_moderation",
      createdAt: expect.any(String),
      status: "evaluated",
      riskLevel: "critical",
      categories: ["child_safety"],
      scores: { child_safety: 0.2 },
    });
  });

  test("a timeout aborts the shared signal passed into fetch", async () => {
    jest.useFakeTimers();
    let capturedSignal;
    const fetchImpl = jest.fn().mockImplementation((_url, options) => {
      capturedSignal = options.signal;
      return new Promise(() => {});
    });
    const provider = createOpenAIModerationProvider({ apiKey: "test-token-abc", fetchImpl });
    const { evaluateText } = createTextModerationService({ provider, timeoutMs: 10 });
    const promise = evaluateText(input);
    await jest.advanceTimersByTimeAsync(10);
    await expect(promise).resolves.toMatchObject({ status: "timeout" });
    expect(capturedSignal.aborted).toBe(true);
    jest.useRealTimers();
  });

  test("HTTP 429 -> provider_unavailable at the #975 contract level", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 429, json: jest.fn() });
    const provider = createOpenAIModerationProvider({ apiKey: "test-token-abc", fetchImpl });
    const { evaluateText } = createTextModerationService({ provider });
    await expect(evaluateText(input)).resolves.toMatchObject({ status: "provider_unavailable" });
  });

  test("HTTP 5xx -> provider_unavailable at the #975 contract level", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 500, json: jest.fn() });
    const provider = createOpenAIModerationProvider({ apiKey: "test-token-abc", fetchImpl });
    const { evaluateText } = createTextModerationService({ provider });
    await expect(evaluateText(input)).resolves.toMatchObject({ status: "provider_unavailable" });
  });

  test("malformed provider payload -> provider_error at the #975 contract level", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true, status: 200, json: jest.fn().mockResolvedValue({ results: [] }),
    });
    const provider = createOpenAIModerationProvider({ apiKey: "test-token-abc", fetchImpl });
    const { evaluateText } = createTextModerationService({ provider });
    await expect(evaluateText(input)).resolves.toMatchObject({ status: "provider_error" });
  });

  test("provider failure never breaks a caller's principal operation", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error("boom"));
    const provider = createOpenAIModerationProvider({ apiKey: "test-token-abc", fetchImpl });
    const { evaluateText } = createTextModerationService({ provider });
    const evaluation = await evaluateText(input);
    const principalOperation = async () => "sent";
    await expect(principalOperation()).resolves.toBe("sent");
    expect(evaluation.status).toBe("provider_unavailable");
  });
});
