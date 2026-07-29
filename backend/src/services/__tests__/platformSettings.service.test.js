jest.mock("../../models/PlatformSettings.js", () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));

const PlatformSettings = require("../../models/PlatformSettings.js");
const {
  getPlatformSettings,
  updatePlatformSettings,
  normalizeUpdates,
} = require("../platformSettings.service.js");

describe("platformSettings.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns safe defaults when no settings document exists", async () => {
    PlatformSettings.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

    const settings = await getPlatformSettings();

    expect(settings.chatProtection.chatProtectionEnabled).toBe(true);
    expect(settings.chatProtection.blockPhones).toBe(true);
    expect(settings.chatProtection.minimumDaysSinceMatch).toBe(7);
    expect(settings.socialCalls.enabled).toBe(true);
    expect(settings.socialCalls.maxDurationSeconds).toBe(900);
    expect(settings.socialCalls.timeoutSeconds).toBe(45);
  });

  test("persists chat protection updates with validation", async () => {
    const stored = {
      boostPriceCrush: 50,
      chatProtection: {
        chatProtectionEnabled: true,
        blockPhones: false,
        minimumMessages: 5,
        trustRuleMode: "any",
      },
    };
    PlatformSettings.findOneAndUpdate.mockReturnValue({ lean: jest.fn().mockResolvedValue(stored) });

    const settings = await updatePlatformSettings({
      chatProtection: {
        blockPhones: false,
        minimumMessages: 5,
        trustRuleMode: "any",
      },
    }, "507f1f77bcf86cd799439011");

    expect(PlatformSettings.findOneAndUpdate).toHaveBeenCalledWith(
      { key: "global" },
      expect.objectContaining({
        $set: expect.objectContaining({
          "chatProtection.blockPhones": false,
          "chatProtection.minimumMessages": 5,
          "chatProtection.trustRuleMode": "any",
          updatedBy: "507f1f77bcf86cd799439011",
        }),
      }),
      expect.objectContaining({ upsert: true, runValidators: true })
    );
    expect(settings.chatProtection.blockPhones).toBe(false);
    expect(settings.chatProtection.minimumMessages).toBe(5);
    expect(settings.chatProtection.trustRuleMode).toBe("any");
  });

  test("rejects invalid trust mode and numeric limits", () => {
    expect(() => normalizeUpdates({ chatProtection: { trustRuleMode: "some" } })).toThrow("trustRuleMode");
    expect(() => normalizeUpdates({ chatProtection: { minimumMessages: -1 } })).toThrow("minimumMessages");
  });

  test("persists social call settings with validation", async () => {
    const stored = {
      socialCalls: {
        enabled: false,
        maxDurationSeconds: 120,
        timeoutSeconds: 20,
        futureRules: { regionGate: "future" },
      },
    };
    PlatformSettings.findOneAndUpdate.mockReturnValue({ lean: jest.fn().mockResolvedValue(stored) });

    const settings = await updatePlatformSettings({
      socialCalls: {
        enabled: false,
        maxDurationSeconds: 120,
        timeoutSeconds: 20,
        futureRules: { regionGate: "future" },
      },
    }, "507f1f77bcf86cd799439011");

    expect(PlatformSettings.findOneAndUpdate).toHaveBeenCalledWith(
      { key: "global" },
      expect.objectContaining({
        $set: expect.objectContaining({
          "socialCalls.enabled": false,
          "socialCalls.maxDurationSeconds": 120,
          "socialCalls.timeoutSeconds": 20,
          "socialCalls.futureRules": { regionGate: "future" },
        }),
      }),
      expect.objectContaining({ upsert: true, runValidators: true })
    );
    expect(settings.socialCalls.enabled).toBe(false);
    expect(settings.socialCalls.maxDurationSeconds).toBe(120);
    expect(settings.socialCalls.timeoutSeconds).toBe(20);
  });

  test("rejects invalid social call limits", () => {
    expect(() => normalizeUpdates({ socialCalls: { maxDurationSeconds: 30 } })).toThrow("maxDurationSeconds");
    expect(() => normalizeUpdates({ socialCalls: { timeoutSeconds: 5 } })).toThrow("timeoutSeconds");
    expect(() => normalizeUpdates({ socialCalls: { futureRules: [] } })).toThrow("futureRules");
  });
});
