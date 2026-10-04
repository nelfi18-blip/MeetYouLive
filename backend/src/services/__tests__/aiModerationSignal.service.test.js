jest.mock("../../models/AIModerationSignal.js", () => ({ create: jest.fn() }));

const AIModerationSignal = require("../../models/AIModerationSignal.js");
const { recordAIModerationSignal } = require("../aiModerationSignal.service.js");

const baseParams = {
  context: "chat_message",
  sourceType: "message",
  sourceId: "507f1f77bcf86cd799439011",
  userId: "507f1f77bcf86cd799439012",
};

describe("aiModerationSignal.service", () => {
  beforeEach(() => jest.clearAllMocks());

  test.each(["not_configured", "provider_unavailable", "provider_error", "invalid_result", "timeout"])(
    "does not persist a signal for unevaluated status %s",
    async (status) => {
      const result = await recordAIModerationSignal({
        ...baseParams,
        evaluation: { status, riskLevel: null, categories: [] },
      });
      expect(result).toBeNull();
      expect(AIModerationSignal.create).not.toHaveBeenCalled();
    }
  );

  test("does not persist a signal for safe evaluated text", async () => {
    const result = await recordAIModerationSignal({
      ...baseParams,
      evaluation: { status: "evaluated", riskLevel: "safe", categories: [] },
    });
    expect(result).toBeNull();
    expect(AIModerationSignal.create).not.toHaveBeenCalled();
  });

  test.each(["low", "medium", "high", "critical"])(
    "persists a minimal signal for risk level %s that needs review",
    async (riskLevel) => {
      AIModerationSignal.create.mockResolvedValue({ _id: "signal1" });
      const evaluation = {
        status: "evaluated", riskLevel, categories: ["harassment"],
        provider: "openai_moderation", scores: { harassment: 0.5 }, confidence: 0.5,
      };
      const result = await recordAIModerationSignal({ ...baseParams, evaluation });
      expect(result).toEqual({ _id: "signal1" });
      expect(AIModerationSignal.create).toHaveBeenCalledWith({
        context: "chat_message",
        sourceType: "message",
        sourceId: baseParams.sourceId,
        userId: baseParams.userId,
        provider: "openai_moderation",
        riskLevel,
        categories: ["harassment"],
        confidence: 0.5,
        scores: { harassment: 0.5 },
      });
    }
  );

  test("the persisted signal never contains the original message text", async () => {
    AIModerationSignal.create.mockResolvedValue({ _id: "signal1" });
    const evaluation = {
      status: "evaluated", riskLevel: "high", categories: ["hate"], provider: "openai_moderation",
    };
    await recordAIModerationSignal({ ...baseParams, evaluation });
    const createdWith = AIModerationSignal.create.mock.calls[0][0];
    expect(createdWith).not.toHaveProperty("text");
    expect(JSON.stringify(createdWith)).not.toMatch(/integration text|sensitive/i);
  });

  test("duplicate (sourceType, sourceId) is treated as a no-op, not an error", async () => {
    const duplicateError = new Error("duplicate key");
    duplicateError.code = 11000;
    AIModerationSignal.create.mockRejectedValue(duplicateError);
    const evaluation = { status: "evaluated", riskLevel: "high", categories: ["hate"] };
    await expect(recordAIModerationSignal({ ...baseParams, evaluation })).resolves.toBeNull();
  });

  test("any other persistence failure is swallowed (fail-open)", async () => {
    AIModerationSignal.create.mockRejectedValue(new Error("db down"));
    const evaluation = { status: "evaluated", riskLevel: "high", categories: ["hate"] };
    await expect(recordAIModerationSignal({ ...baseParams, evaluation })).resolves.toBeNull();
  });

  test("missing required references does not call the model", async () => {
    const evaluation = { status: "evaluated", riskLevel: "high", categories: ["hate"] };
    await recordAIModerationSignal({ ...baseParams, sourceId: undefined, evaluation });
    expect(AIModerationSignal.create).not.toHaveBeenCalled();
  });
});
