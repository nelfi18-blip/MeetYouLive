const { normalizePhoneNumber, isValidE164Phone, maskPhoneNumber } = require("../phone.js");

describe("phone helpers", () => {
  test("normalizes phone numbers with formatting characters into E.164 candidates", () => {
    expect(normalizePhoneNumber("+34 123 456 789")).toBe("+34123456789");
    expect(normalizePhoneNumber("+1 (555) 123-4567")).toBe("+15551234567");
    expect(normalizePhoneNumber("  +34123456789  ")).toBe("+34123456789");
  });

  test("returns null for empty or non-string input", () => {
    expect(normalizePhoneNumber("")).toBeNull();
    expect(normalizePhoneNumber("   ")).toBeNull();
    expect(normalizePhoneNumber(null)).toBeNull();
    expect(normalizePhoneNumber(undefined)).toBeNull();
    expect(normalizePhoneNumber(12345)).toBeNull();
    expect(normalizePhoneNumber("abc")).toBeNull();
  });

  test("validates well-formed E.164 numbers", () => {
    expect(isValidE164Phone("+34123456789")).toBe(true);
    expect(isValidE164Phone("+15551234567")).toBe(true);
  });

  test("rejects invalid phone numbers", () => {
    expect(isValidE164Phone("123456789")).toBe(false); // missing +
    expect(isValidE164Phone("+0123456789")).toBe(false); // leading zero after +
    expect(isValidE164Phone("+1234")).toBe(false); // too short
    expect(isValidE164Phone("+1234567890123456")).toBe(false); // too long
    expect(isValidE164Phone("+34 123 456 789")).toBe(false); // not normalized
    expect(isValidE164Phone("not-a-phone")).toBe(false);
    expect(isValidE164Phone(null)).toBe(false);
  });

  test("masks phone numbers keeping prefix and last two digits", () => {
    const masked = maskPhoneNumber("+34123456789");
    expect(masked.startsWith("+34")).toBe(true);
    expect(masked.endsWith("89")).toBe(true);
    expect(masked).not.toContain("1234567");
  });

  test("returns empty string when masking invalid/short input", () => {
    expect(maskPhoneNumber("")).toBe("");
    expect(maskPhoneNumber(null)).toBe("");
    expect(maskPhoneNumber("+1")).toBe("");
  });
});
