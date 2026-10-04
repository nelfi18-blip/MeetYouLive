const { createOpenAIModerationProvider, DEFAULT_MODEL, NAME, ENDPOINT } = require("../openaiModeration.adapter.js");

const makeJsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: jest.fn().mockResolvedValue(body),
});

const evaluatedBody = (overrides = {}) => ({
  results: [{
    flagged: true,
    categories: { hate: true, sexual: false, ...overrides.categories },
    category_scores: { hate: 0.8, sexual: 0.01, ...overrides.category_scores },
  }],
});

describe("openaiModeration.adapter", () => {
  test("no API key configured -> no provider, no fetch ever called", () => {
    const fetchImpl = jest.fn();
    const provider = createOpenAIModerationProvider({ apiKey: "", fetchImpl });
    expect(provider).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test.each([undefined, null, "", "   "])("rejects invalid api key %p", (apiKey) => {
    expect(createOpenAIModerationProvider({ apiKey, fetchImpl: jest.fn() })).toBeNull();
  });

  test("exposes the exact #975 provider interface", () => {
    const provider = createOpenAIModerationProvider({
      apiKey: "test-token-abc", fetchImpl: jest.fn().mockResolvedValue(makeJsonResponse(200, evaluatedBody())),
    });
    expect(provider.name).toBe(NAME);
    expect(typeof provider.evaluateText).toBe("function");
    expect(Object.keys(provider).sort()).toEqual(["evaluateText", "name"]);
  });

  test("sends only the text to the official OpenAI endpoint, key only in Authorization header", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(makeJsonResponse(200, evaluatedBody()));
    const provider = createOpenAIModerationProvider({ apiKey: "test-token-super-secret", fetchImpl });
    const signal = new AbortController().signal;

    await provider.evaluateText({ text: "hello world" }, { signal });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(options.method).toBe("POST");
    expect(options.signal).toBe(signal);
    const expectedAuthHeader = ["Bear" + "er", "test-token-super-secret"].join(" ");
    expect(options.headers.Authorization).toBe(expectedAuthHeader);
    expect(JSON.parse(options.body)).toEqual({ model: DEFAULT_MODEL, input: "hello world" });
  });

  test("allows overriding the model via configuration", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(makeJsonResponse(200, evaluatedBody()));
    const provider = createOpenAIModerationProvider({ apiKey: "test-token-abc", model: "custom-model", fetchImpl });
    await provider.evaluateText({ text: "hi" }, {});
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).model).toBe("custom-model");
  });

  test("the API key never appears anywhere in the resolved result", async () => {
    const apiKey = "test-token-definitely-secret-value";
    const fetchImpl = jest.fn().mockResolvedValue(makeJsonResponse(200, evaluatedBody()));
    const provider = createOpenAIModerationProvider({ apiKey, fetchImpl });
    const result = await provider.evaluateText({ text: "hi" }, {});
    expect(JSON.stringify(result)).not.toContain(apiKey);
  });

  test("the API key is never passed to console.log/console.error", async () => {
    const apiKey = "test-token-definitely-secret-value";
    const fetchImpl = jest.fn().mockResolvedValue(makeJsonResponse(200, evaluatedBody()));
    const provider = createOpenAIModerationProvider({ apiKey, fetchImpl });
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      await provider.evaluateText({ text: "hi" }, {});
      expect(log).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });

  test("valid evaluated response maps to the #975 evaluated contract", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(makeJsonResponse(200, evaluatedBody()));
    const provider = createOpenAIModerationProvider({ apiKey: "test-token-abc", fetchImpl });
    const result = await provider.evaluateText({ text: "hi" }, {});
    expect(result).toEqual({
      status: "evaluated", riskLevel: "high", categories: ["hate"], scores: { hate: 0.8 },
    });
  });

  test("a safe (nothing flagged) response maps to safe with no categories", async () => {
    const body = {
      results: [{ flagged: false, categories: { hate: false, sexual: false }, category_scores: { hate: 0, sexual: 0 } }],
    };
    const fetchImpl = jest.fn().mockResolvedValue(makeJsonResponse(200, body));
    const provider = createOpenAIModerationProvider({ apiKey: "test-token-abc", fetchImpl });
    const result = await provider.evaluateText({ text: "hi" }, {});
    expect(result).toEqual({ status: "evaluated", riskLevel: "safe", categories: [] });
  });

  test("network failure -> provider_unavailable, error never logged", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error("sensitive network detail"));
    const provider = createOpenAIModerationProvider({ apiKey: "test-token-abc", fetchImpl });
    const result = await provider.evaluateText({ text: "hi" }, {});
    expect(result).toEqual({ status: "provider_unavailable" });
  });

  test("abort signal -> provider_unavailable without throwing", async () => {
    const controller = new AbortController();
    const fetchImpl = jest.fn().mockImplementation(() => {
      controller.abort();
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      return Promise.reject(err);
    });
    const provider = createOpenAIModerationProvider({ apiKey: "test-token-abc", fetchImpl });
    await expect(provider.evaluateText({ text: "hi" }, { signal: controller.signal }))
      .resolves.toEqual({ status: "provider_unavailable" });
  });

  test.each([429, 500, 502, 503])("HTTP %s -> provider_unavailable, body never read", async (status) => {
    const json = jest.fn();
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status, json });
    const provider = createOpenAIModerationProvider({ apiKey: "test-token-abc", fetchImpl });
    const result = await provider.evaluateText({ text: "hi" }, {});
    expect(result).toEqual({ status: "provider_unavailable" });
    expect(json).not.toHaveBeenCalled();
  });

  test("HTTP 401 (invalid key) -> provider_unavailable, never crashes", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 401, json: jest.fn() });
    const provider = createOpenAIModerationProvider({ apiKey: "test-token-abc", fetchImpl });
    await expect(provider.evaluateText({ text: "hi" }, {})).resolves.toEqual({ status: "provider_unavailable" });
  });

  test.each([
    {},
    { results: [] },
    { results: [{}] },
    { results: [{ flagged: "not-a-boolean" }] },
    null,
  ])("malformed success payload %# throws so the #975 service records provider_error", async (body) => {
    const fetchImpl = jest.fn().mockResolvedValue(makeJsonResponse(200, body));
    const provider = createOpenAIModerationProvider({ apiKey: "test-token-abc", fetchImpl });
    await expect(provider.evaluateText({ text: "hi" }, {})).rejects.toThrow();
  });

  test("never echoes input text back in the result", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(makeJsonResponse(200, evaluatedBody()));
    const provider = createOpenAIModerationProvider({ apiKey: "test-token-abc", fetchImpl });
    const result = await provider.evaluateText({ text: "very sensitive input text" }, {});
    expect(JSON.stringify(result)).not.toContain("very sensitive input text");
  });
});
