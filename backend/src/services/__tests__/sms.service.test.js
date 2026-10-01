describe("sms.service", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.SMS_PROVIDER;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test("fails explicitly when no SMS provider is configured (never fakes success)", async () => {
    const { sendPhoneVerificationSms, SmsServiceError } = require("../sms.service.js");
    await expect(sendPhoneVerificationSms("+34123456789", "123456")).rejects.toThrow(SmsServiceError);
    await expect(sendPhoneVerificationSms("+34123456789", "123456")).rejects.toMatchObject({
      code: "SMS_NOT_CONFIGURED",
    });
  });

  test("reports unconfigured status via getSmsConfigSummary", () => {
    const { getSmsConfigSummary } = require("../sms.service.js");
    expect(getSmsConfigSummary()).toMatchObject({ provider: "unconfigured", configured: false });
  });

  test("fails explicitly (not implemented) when a provider is set but not wired up", async () => {
    process.env.SMS_PROVIDER = "twilio";
    const { sendPhoneVerificationSms, SmsServiceError } = require("../sms.service.js");
    await expect(sendPhoneVerificationSms("+34123456789", "123456")).rejects.toThrow(SmsServiceError);
    await expect(sendPhoneVerificationSms("+34123456789", "123456")).rejects.toMatchObject({
      code: "SMS_PROVIDER_NOT_IMPLEMENTED",
    });
  });

  test("never logs the raw OTP code", async () => {
    const consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const { sendPhoneVerificationSms } = require("../sms.service.js");
    const code = "654321";
    await sendPhoneVerificationSms("+34123456789", code).catch(() => {});
    const allLoggedArgs = [...consoleLogSpy.mock.calls, ...consoleErrorSpy.mock.calls]
      .flat()
      .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)));
    expect(allLoggedArgs.some((entry) => entry.includes(code))).toBe(false);
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
