/**
 * Minimal E.164 phone number helpers.
 *
 * MeetYouLive stores phone numbers normalized to E.164 (e.g. "+34123456789").
 * This module intentionally has no external dependency (no carrier lookup /
 * region-aware parsing) to keep the change surface small; it only validates
 * the well-known E.164 shape: a leading "+", followed by 8-15 digits, the
 * first of which is 1-9.
 */

// "+" followed by a non-zero digit and 6-14 more digits (7-15 digits total,
// matching the ITU-T E.164 maximum length of 15 digits).
const E164_REGEX = /^\+[1-9]\d{6,14}$/;

/**
 * Strip formatting characters (spaces, dashes, parentheses, dots) from a
 * user-supplied phone number and coerce it into a "+<digits>" candidate.
 * Returns null when the input has no usable digits.
 */
function normalizePhoneNumber(input) {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^\d]/g, "");
  if (!digits) return null;
  return `+${digits}`;
}

/** Whether a (normalized) phone number matches the E.164 shape. */
function isValidE164Phone(value) {
  return typeof value === "string" && E164_REGEX.test(value);
}

/**
 * Mask a phone number for display to its owner, keeping the country code
 * prefix and the last 2 digits visible (e.g. "+34******89").
 */
function maskPhoneNumber(value) {
  if (typeof value !== "string" || value.length < 6) return "";
  const prefixLength = Math.min(3, value.length - 4);
  const prefix = value.slice(0, Math.max(1, prefixLength));
  const suffix = value.slice(-2);
  const maskedLength = Math.max(0, value.length - prefix.length - suffix.length);
  return `${prefix}${"*".repeat(maskedLength)}${suffix}`;
}

module.exports = {
  E164_REGEX,
  normalizePhoneNumber,
  isValidE164Phone,
  maskPhoneNumber,
};
