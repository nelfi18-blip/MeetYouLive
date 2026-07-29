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
});
