jest.mock("../../models/PlatformSettings.js", () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));

const PlatformSettings = require("../../models/PlatformSettings.js");
const {
  getPlatformSettings,
  updatePlatformSettings,
  normalizeUpdates,
  PAYOUT_AUTOMATION_PROVIDER_READY,
} = require("../platformSettings.service.js");

describe("platformSettings.service — payoutMode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("automatic payout processing is not yet available (no integrated/tested/authorized provider)", () => {
    expect(PAYOUT_AUTOMATION_PROVIDER_READY).toBe(false);
  });

  test("defaults payoutMode to 'manual' when no settings document exists", async () => {
    PlatformSettings.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

    const settings = await getPlatformSettings();

    expect(settings.payoutMode).toBe("manual");
    expect(settings.payoutAutomationAvailable).toBe(false);
    expect(settings.payoutModeUpdatedBy).toBeNull();
  });

  test("falls back to 'manual' if a stored document somehow has an invalid payoutMode value", async () => {
    PlatformSettings.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ payoutMode: "some-bogus-value" }),
    });

    const settings = await getPlatformSettings();

    expect(settings.payoutMode).toBe("manual");
  });

  test("normalizeUpdates rejects an unknown payoutMode value", () => {
    expect(() => normalizeUpdates({ payoutMode: "turbo" })).toThrow("payoutMode");
  });

  test("normalizeUpdates / updatePlatformSettings REJECTS switching to 'automatic' via the API — hard gate until a provider is integrated, tested and authorized", async () => {
    expect(() => normalizeUpdates({ payoutMode: "automatic" })).toThrow(
      /no está disponible/i
    );

    await expect(
      updatePlatformSettings({ payoutMode: "automatic" }, "507f1f77bcf86cd799439011")
    ).rejects.toMatchObject({ status: 403 });

    // No write to MongoDB should ever be attempted for a rejected mode switch.
    expect(PlatformSettings.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("allows switching to 'manual' (always allowed, so automation can be reverted immediately) and records who changed it", async () => {
    const stored = {
      payoutMode: "manual",
      payoutModeUpdatedBy: "507f1f77bcf86cd799439011",
      payoutModeUpdatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    PlatformSettings.findOneAndUpdate.mockReturnValue({ lean: jest.fn().mockResolvedValue(stored) });

    const settings = await updatePlatformSettings(
      { payoutMode: "manual" },
      "507f1f77bcf86cd799439011"
    );

    expect(PlatformSettings.findOneAndUpdate).toHaveBeenCalledWith(
      { key: "global" },
      expect.objectContaining({
        $set: expect.objectContaining({
          payoutMode: "manual",
          updatedBy: "507f1f77bcf86cd799439011",
          payoutModeUpdatedBy: "507f1f77bcf86cd799439011",
          payoutModeUpdatedAt: expect.any(Date),
        }),
      }),
      expect.objectContaining({ upsert: true, runValidators: true })
    );
    expect(settings.payoutMode).toBe("manual");
  });

  test("updating unrelated settings (no payoutMode in input) never touches payoutMode fields", async () => {
    const stored = { boostPriceCrush: 75, payoutMode: "manual" };
    PlatformSettings.findOneAndUpdate.mockReturnValue({ lean: jest.fn().mockResolvedValue(stored) });

    await updatePlatformSettings({ boostPriceCrush: 75 }, "507f1f77bcf86cd799439011");

    const callArgs = PlatformSettings.findOneAndUpdate.mock.calls[0][1];
    expect(callArgs.$set).not.toHaveProperty("payoutMode");
    expect(callArgs.$set).not.toHaveProperty("payoutModeUpdatedBy");
    expect(callArgs.$set).not.toHaveProperty("payoutModeUpdatedAt");
  });
});
