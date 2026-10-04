jest.mock("../../models/User.js", () => ({
  updateOne: jest.fn(), findByIdAndUpdate: jest.fn(), deleteOne: jest.fn(),
}));
jest.mock("../../models/Report.js", () => ({ create: jest.fn() }));
jest.mock("../../models/Message.js", () => ({ deleteOne: jest.fn() }));
jest.mock("../../models/Live.js", () => ({ updateOne: jest.fn() }));
jest.mock("../coins.service.js", () => ({ transferCoins: jest.fn() }));
jest.mock("../../lib/socket.js", () => ({ getIO: jest.fn() }));

const User = require("../../models/User.js");
const Report = require("../../models/Report.js");
const Message = require("../../models/Message.js");
const Live = require("../../models/Live.js");
const coins = require("../coins.service.js");
const socket = require("../../lib/socket.js");
const {
  createTextModerationService, evaluateText,
  MAX_TEXT_LENGTH, RISK_LEVELS, CATEGORIES, CONTEXTS,
} = require("../textModeration.service.js");

const input = { context: "chat_message", text: "Text for human review" };
const classification = {
  status: "evaluated", riskLevel: "high", categories: ["harassment"],
};
// All providers in this file are test doubles, not production classifiers.
const makeProvider = (result = classification) => ({
  name: "test_double",
  evaluateText: jest.fn().mockResolvedValue(result),
});
const expectUnevaluated = (result, status, provider = "test_double") => {
  expect(result).toEqual({
    context: input.context, provider, status, riskLevel: null, categories: [],
    createdAt: expect.any(String),
  });
  expect(Number.isNaN(Date.parse(result.createdAt))).toBe(false);
};

describe("internal text moderation foundation", () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.useRealTimers());

  test("valid input produces structured metadata without retaining text", async () => {
    const provider = makeProvider({
      ...classification, confidence: 0.8, scores: { harassment: 0.9, hate: 0 },
    });
    const result = await createTextModerationService({ provider }).evaluateText(input);
    expect(result).toEqual({
      ...classification, confidence: 0.8, scores: { harassment: 0.9, hate: 0 },
      context: input.context, provider: "test_double", createdAt: expect.any(String),
    });
    expect(provider.evaluateText).toHaveBeenCalledWith(
      { text: input.text }, { signal: expect.any(AbortSignal) }
    );
    expect(JSON.stringify(result)).not.toContain(input.text);
  });

  test.each(CONTEXTS)("accepts allowlisted context %s", async (context) => {
    const result = await evaluateText({ ...input, context });
    expect(result.context).toBe(context);
    expect(result.status).toBe("not_configured");
  });

  test.each([
    null, undefined, [], "text", {}, { text: "text" },
    { ...input, text: null }, { ...input, text: 123 },
    { ...input, text: "" }, { ...input, text: " \n\t" },
    { ...input, context: "video" }, { ...input, context: {} },
    { ...input, targetId: "507f1f77bcf86cd799439011" },
    { ...input, targetType: "User" }, { ...input, reportId: "forged" },
    { ...input, reviewed: true }, { ...input, riskLevel: "safe" },
    { ...input, enforcement: "ban" }, { ...input, token: "not-a-token" },
    { ...input, user: {} }, { ...input, req: {} },
  ])("rejects invalid or out-of-scope input %# before calling provider", async (payload) => {
    const provider = makeProvider();
    await expect(createTextModerationService({ provider }).evaluateText(payload))
      .rejects.toThrow("Invalid text moderation input");
    expect(provider.evaluateText).not.toHaveBeenCalled();
    await expect(evaluateText(payload)).rejects.toThrow("Invalid text moderation input");
  });

  test("accepts the exact length boundary and rejects one code unit more", async () => {
    const provider = makeProvider();
    const service = createTextModerationService({ provider });
    await expect(service.evaluateText({ ...input, text: "a".repeat(MAX_TEXT_LENGTH) }))
      .resolves.toMatchObject({ status: "evaluated" });
    await expect(service.evaluateText({ ...input, text: "a".repeat(MAX_TEXT_LENGTH + 1) }))
      .rejects.toThrow("Invalid text moderation input");
    await expect(service.evaluateText({ ...input, text: "😀".repeat(MAX_TEXT_LENGTH / 2) }))
      .resolves.toMatchObject({ status: "evaluated" });
    expect(provider.evaluateText).toHaveBeenCalledTimes(2);
  });

  test("the production default is explicitly not configured, never safe", async () => {
    expectUnevaluated(await evaluateText(input), "not_configured", null);
  });

  test("adapter unavailability is explicit and unevaluated", async () => {
    const provider = makeProvider({ status: "provider_unavailable" });
    expectUnevaluated(
      await createTextModerationService({ provider }).evaluateText(input),
      "provider_unavailable"
    );
  });

  test.each(["sync", "async"])("%s provider failure lets a caller continue its principal operation", async (mode) => {
    const provider = makeProvider();
    const failure = new Error("sensitive provider response");
    if (mode === "sync") provider.evaluateText.mockImplementation(() => { throw failure; });
    else provider.evaluateText.mockRejectedValue(failure);
    const principalOperation = jest.fn().mockResolvedValue("operation completed");
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await createTextModerationService({ provider }).evaluateText(input);
      const operationResult = await principalOperation();
      expectUnevaluated(result, "provider_error");
      expect(operationResult).toBe("operation completed");
      expect(principalOperation).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(result)).not.toContain(failure.message);
      expect(log).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });

  test("bounds a stalled provider, aborts it and handles late rejection", async () => {
    jest.useFakeTimers();
    let rejectProvider;
    const provider = makeProvider();
    provider.evaluateText.mockImplementation(() => new Promise((_resolve, reject) => {
      rejectProvider = reject;
    }));
    const promise = createTextModerationService({ provider, timeoutMs: 25 }).evaluateText(input);
    await jest.advanceTimersByTimeAsync(25);
    expectUnevaluated(await promise, "timeout");
    expect(provider.evaluateText.mock.calls[0][1].signal.aborted).toBe(true);
    rejectProvider(new Error("late provider error"));
    await jest.advanceTimersByTimeAsync(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  test("uses the default duration and clears its timer on success", async () => {
    jest.useFakeTimers();
    const provider = makeProvider();
    await createTextModerationService({ provider }).evaluateText(input);
    expect(jest.getTimerCount()).toBe(0);
    provider.evaluateText.mockImplementation(() => new Promise(() => {}));
    const promise = createTextModerationService({ provider }).evaluateText(input);
    await jest.advanceTimersByTimeAsync(1999);
    expect(provider.evaluateText.mock.calls[1][1].signal.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expectUnevaluated(await promise, "timeout");
  });

  test.each(RISK_LEVELS)("%s has zero enforcement, reporting, coin or socket side effects", async (riskLevel) => {
    const provider = makeProvider({
      status: "evaluated", riskLevel, categories: riskLevel === "safe" ? [] : ["other"],
    });
    const result = await createTextModerationService({ provider }).evaluateText(input);
    expect(result.riskLevel).toBe(riskLevel);
    expect(result).not.toHaveProperty("action");
    for (const dependency of [User, Report, Message, Live, coins, socket]) {
      for (const method of Object.values(dependency)) expect(method).not.toHaveBeenCalled();
    }
    // Guard the architectural boundary, including writes not covered by spies.
    const dependencies = require.cache[require.resolve("../textModeration.service.js")].children;
    expect(dependencies.every((module) => module.id.includes("/node_modules/zod/"))).toBe(true);
  });

  test.each(CATEGORIES)("supports provider category %s", async (category) => {
    const provider = makeProvider({ ...classification, categories: [category] });
    await expect(createTextModerationService({ provider }).evaluateText(input))
      .resolves.toMatchObject({ categories: [category] });
  });

  test.each([
    null, undefined, [], "safe", {},
    { ...classification, status: "unknown" },
    { ...classification, riskLevel: "unknown" },
    { ...classification, riskLevel: null },
    { ...classification, categories: ["unknown"] },
    { ...classification, categories: ["harassment", "harassment"] },
    { ...classification, categories: [] },
    { ...classification, riskLevel: "safe" },
    { ...classification, confidence: NaN },
    { ...classification, confidence: Infinity },
    { ...classification, confidence: -0.1 },
    { ...classification, confidence: 1.1 },
    { ...classification, confidence: "0.9" },
    { ...classification, confidence: null },
    { ...classification, scores: { harassment: 2 } },
    { ...classification, scores: { harassment: NaN } },
    { ...classification, scores: { unknown: 0.5 } },
    { ...classification, scores: { harassment: "0.5" } },
    { ...classification, scores: null },
    { ...classification, action: "ban" },
    { ...classification, provider: "forged" },
    { ...classification, text: "sensitive echo" },
    { status: "provider_unavailable", riskLevel: "safe", categories: [] },
  ])("malformed provider output %# is unevaluated, not safe or dangerous", async (output) => {
    const provider = makeProvider();
    provider.evaluateText.mockResolvedValue(output);
    expectUnevaluated(
      await createTextModerationService({ provider }).evaluateText(input), "invalid_result"
    );
  });

  test.each([0, 1])("accepts valid confidence and score boundary %s", async (value) => {
    const provider = makeProvider({
      ...classification, confidence: value, scores: { harassment: value },
    });
    await expect(createTextModerationService({ provider }).evaluateText(input))
      .resolves.toMatchObject({ confidence: value, scores: { harassment: value } });
  });

  test.each([0, -1, 5001, Infinity, NaN, 2.5, "20"])("rejects invalid timeout %s", (timeoutMs) => {
    expect(() => createTextModerationService({ timeoutMs })).toThrow(TypeError);
  });

  test.each([{}, { name: "invalid name", evaluateText: () => {} }, { name: "valid" }])(
    "rejects invalid provider configuration %#", (provider) => {
      expect(() => createTextModerationService({ provider })).toThrow(TypeError);
    }
  );
});
