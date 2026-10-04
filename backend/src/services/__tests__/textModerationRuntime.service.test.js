describe("textModerationRuntime.service", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test("without OPENAI_API_KEY, evaluateText never makes outbound calls and reports not_configured", async () => {
    delete process.env.OPENAI_API_KEY;
    const originalFetch = global.fetch;
    global.fetch = jest.fn();
    try {
      const { evaluateText } = require("../textModerationRuntime.service.js");
      const result = await evaluateText({ context: "chat_message", text: "hello" });
      expect(result.status).toBe("not_configured");
      expect(result.riskLevel).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("with OPENAI_API_KEY set, the module wires a configured provider (still fail-safe, no live call made)", async () => {
    process.env.OPENAI_API_KEY = "test-token-present";
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error("no network in tests"));
    try {
      const { evaluateText } = require("../textModerationRuntime.service.js");
      const result = await evaluateText({ context: "chat_message", text: "hello" });
      expect(result.status).toBe("provider_unavailable");
      expect(result.provider).toBe("openai_moderation");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
