/**
 * Tests for email.service.js — verifies that the historical SMTP_* variable
 * names (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM) are the ones
 * the service actually reads, and that Nodemailer is initialised correctly.
 *
 * The test does NOT require a real SMTP server: nodemailer.createTransport is
 * mocked so we can inspect the options passed to it.
 */

const nodemailer = require("nodemailer");

jest.mock("nodemailer");

const MOCK_SEND_MAIL = jest.fn().mockResolvedValue({
  messageId: "<test@example.com>",
  accepted: ["user@example.com"],
  rejected: [],
  response: "250 OK",
});

/**
 * Load a fresh copy of email.service.js so that the module-level `transporter`
 * singleton is reset between test groups (each call to jest.resetModules() +
 * require gives an isolated instance).
 */
function loadFreshEmailService() {
  jest.resetModules();
  // Re-mock nodemailer after resetModules so the new require picks it up.
  const nm = require("nodemailer");
  nm.createTransport = jest.fn().mockReturnValue({ sendMail: MOCK_SEND_MAIL });
  return require("../email.service.js");
}

describe("email.service — SMTP transport initialisation with historical variable names", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    MOCK_SEND_MAIL.mockClear();
    nodemailer.createTransport = jest.fn().mockReturnValue({ sendMail: MOCK_SEND_MAIL });
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test("uses SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS to build the Nodemailer transport", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "465";
    process.env.SMTP_USER = "user@example.com";
    process.env.SMTP_PASS = "secret";
    delete process.env.ALLOW_DEV_EMAIL_FALLBACK;

    const { sendVerificationEmail } = loadFreshEmailService();
    const nm = require("nodemailer");

    await sendVerificationEmail("recipient@example.com", "123456");

    expect(nm.createTransport).toHaveBeenCalledTimes(1);
    const opts = nm.createTransport.mock.calls[0][0];
    expect(opts.host).toBe("smtp.example.com");
    expect(opts.port).toBe(465);
    expect(opts.secure).toBe(true);     // port 465 → TLS
    expect(opts.auth.user).toBe("user@example.com");
    expect(opts.auth.pass).toBe("secret");
    // Must NOT fall back to jsonTransport
    expect(opts.jsonTransport).toBeUndefined();
  });

  test("port 587 sets secure: false", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "user@example.com";
    process.env.SMTP_PASS = "secret";
    delete process.env.ALLOW_DEV_EMAIL_FALLBACK;

    const { sendVerificationEmail } = loadFreshEmailService();
    const nm = require("nodemailer");

    await sendVerificationEmail("recipient@example.com", "654321");

    const opts = nm.createTransport.mock.calls[0][0];
    expect(opts.port).toBe(587);
    expect(opts.secure).toBe(false);
  });

  test("missing SMTP_HOST with ALLOW_DEV_EMAIL_FALLBACK=true falls back to jsonTransport", async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    process.env.ALLOW_DEV_EMAIL_FALLBACK = "true";

    const { sendVerificationEmail } = loadFreshEmailService();
    const nm = require("nodemailer");

    await sendVerificationEmail("dev@example.com", "000000");

    const opts = nm.createTransport.mock.calls[0][0];
    expect(opts.jsonTransport).toBe(true);
  });

  test("missing SMTP config without dev fallback throws EMAIL_NOT_CONFIGURED", async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.ALLOW_DEV_EMAIL_FALLBACK;

    const { sendVerificationEmail, MailServiceError } = loadFreshEmailService();

    await expect(sendVerificationEmail("x@example.com", "111111")).rejects.toMatchObject({
      name: "MailServiceError",
      code: "EMAIL_NOT_CONFIGURED",
    });
  });

  test("partial SMTP config (host + user but no pass) throws EMAIL_CONFIG_INVALID", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "user@example.com";
    delete process.env.SMTP_PASS;
    delete process.env.ALLOW_DEV_EMAIL_FALLBACK;

    const { sendVerificationEmail } = loadFreshEmailService();

    await expect(sendVerificationEmail("x@example.com", "222222")).rejects.toMatchObject({
      name: "MailServiceError",
      code: "EMAIL_CONFIG_INVALID",
    });
  });

  test("SMTP_FROM is read for the From header; falls back to default when absent", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "user@example.com";
    process.env.SMTP_PASS = "secret";
    process.env.SMTP_FROM = "Custom Sender <custom@example.com>";

    const { sendVerificationEmail } = loadFreshEmailService();
    const nm = require("nodemailer");

    // Capture the options passed to sendMail
    const sendMailSpy = jest.fn().mockResolvedValue({
      messageId: "<t@e.com>",
      accepted: ["r@e.com"],
      rejected: [],
    });
    nm.createTransport.mockReturnValue({ sendMail: sendMailSpy });

    await sendVerificationEmail("r@e.com", "333333");

    const mailOpts = sendMailSpy.mock.calls[0][0];
    expect(mailOpts.from).toBe("Custom Sender <custom@example.com>");
  });
});

describe("email.service — verifySmtpConfig startup check", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test("logs OK when verify() resolves", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "user@example.com";
    process.env.SMTP_PASS = "secret";
    delete process.env.ALLOW_DEV_EMAIL_FALLBACK;

    // loadFreshEmailService calls jest.resetModules() internally; after it returns
    // we re-require nodemailer to get the same fresh mock instance the service holds.
    const { verifySmtpConfig } = loadFreshEmailService();
    const freshNm = require("nodemailer");
    const verifySpy = jest.fn().mockResolvedValue(true);
    freshNm.createTransport.mockReturnValue({ sendMail: MOCK_SEND_MAIL, verify: verifySpy });

    const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await verifySmtpConfig();

    expect(verifySpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("verified OK"));
    consoleSpy.mockRestore();
  });

  test("logs error code (not credentials) when verify() rejects", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "user@example.com";
    process.env.SMTP_PASS = "secret";
    delete process.env.ALLOW_DEV_EMAIL_FALLBACK;

    const authErr = Object.assign(new Error("535 Authentication failed"), {
      code: "EAUTH",
      responseCode: 535,
      command: "AUTH PLAIN",
    });
    const { verifySmtpConfig } = loadFreshEmailService();
    const freshNm = require("nodemailer");
    const verifySpy = jest.fn().mockRejectedValue(authErr);
    freshNm.createTransport.mockReturnValue({ sendMail: MOCK_SEND_MAIL, verify: verifySpy });

    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await verifySmtpConfig();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("SMTP verify failed"),
      expect.objectContaining({ code: "EAUTH", responseCode: 535 })
    );
    // Must NOT log the password or username
    const loggedArgs = JSON.stringify(errorSpy.mock.calls);
    expect(loggedArgs).not.toContain("secret");
    expect(loggedArgs).not.toContain("user@example.com");
    errorSpy.mockRestore();
  });

  test("does not call verify() for jsonTransport dev fallback", async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    process.env.ALLOW_DEV_EMAIL_FALLBACK = "true";

    const { verifySmtpConfig } = loadFreshEmailService();
    const freshNm = require("nodemailer");
    const verifySpy = jest.fn();
    freshNm.createTransport.mockReturnValue({
      sendMail: MOCK_SEND_MAIL,
      verify: verifySpy,
      options: { jsonTransport: true },
    });

    await verifySmtpConfig();

    expect(verifySpy).not.toHaveBeenCalled();
  });

  test("verifySmtpConfig never throws even if transport creation fails", async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.ALLOW_DEV_EMAIL_FALLBACK;

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { verifySmtpConfig } = loadFreshEmailService();

    await expect(verifySmtpConfig()).resolves.toBeUndefined();
    warnSpy.mockRestore();
  });
});
