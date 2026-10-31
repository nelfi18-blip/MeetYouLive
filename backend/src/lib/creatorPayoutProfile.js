"use strict";

/**
 * Pure helpers shared by the creator payout-profile controller and by
 * requestPayout's completeness gate (creator.controller.js). Kept
 * dependency-free (no mongoose/model imports) so both call sites can share
 * the exact same "is this profile usable?" definition without importing
 * each other.
 *
 * Deliberately conservative, same spirit as PAYPAL_EMAIL_PATTERN in
 * validate.middleware.js: just enough to catch obviously-wrong input before
 * it is persisted/relied upon, not a full RFC/ISO validator.
 */

const BENEFICIARY_TYPES = ["individual", "company"];
const DESTINATION_METHODS = ["paypal"];
const TAX_DOCS_STATUSES = ["not_started", "pending_review"];

// ISO 3166-1 alpha-2 shape only (e.g. "US", "MX"). We intentionally do not
// validate against a fixed country list here — frontend/lib/countryDetection.js
// already maps free-text country names to these codes, so by the time a
// value reaches the backend it should already be a 2-letter code.
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

// Mirrors PAYPAL_EMAIL_PATTERN in validate.middleware.js. Duplicated
// intentionally: this module must stay free of any require() so it can be
// imported from both the payout-profile controller and requestPayout
// without risking a circular dependency.
const PAYPAL_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isBeneficiaryStepComplete(profile) {
  if (!profile) return false;
  return (
    Boolean(profile.legalName && String(profile.legalName).trim()) &&
    COUNTRY_CODE_PATTERN.test(String(profile.residenceCountry || "")) &&
    COUNTRY_CODE_PATTERN.test(String(profile.taxResidenceCountry || "")) &&
    BENEFICIARY_TYPES.includes(profile.beneficiaryType)
  );
}

function isDestinationStepComplete(profile) {
  if (!profile) return false;
  return (
    profile.destinationMethod === "paypal" &&
    PAYPAL_EMAIL_PATTERN.test(String(profile.paypalEmail || ""))
  );
}

/**
 * The single source of truth for "can this creator request a payout?".
 * Both steps (beneficiary + destination) must be complete. Does NOT imply
 * the PayPal email is verified — a syntactically valid address is not a
 * verified PayPal account, it only means the creator has registered a
 * destination to pay out to.
 */
function isPayoutProfileComplete(profile) {
  return isBeneficiaryStepComplete(profile) && isDestinationStepComplete(profile);
}

/**
 * Partially masks a PayPal email for summary views (e.g. "jo••••@gmail.com").
 * Never used to decide completeness/validity — only for display.
 */
function maskPaypalEmail(email) {
  const value = typeof email === "string" ? email.trim() : "";
  if (!value) return "";
  const atIndex = value.indexOf("@");
  if (atIndex <= 0) return "••••";
  const local = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  const maskedLocal = `${visible}${"•".repeat(Math.max(local.length - visible.length, 2))}`;
  return `${maskedLocal}@${domain}`;
}

module.exports = {
  BENEFICIARY_TYPES,
  DESTINATION_METHODS,
  TAX_DOCS_STATUSES,
  COUNTRY_CODE_PATTERN,
  PAYPAL_EMAIL_PATTERN,
  isBeneficiaryStepComplete,
  isDestinationStepComplete,
  isPayoutProfileComplete,
  maskPaypalEmail,
};
