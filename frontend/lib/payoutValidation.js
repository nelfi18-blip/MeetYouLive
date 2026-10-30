/**
 * Conservative PayPal email validation shared by the creator payout modal
 * and its tests. Mirrors (intentionally, not by import — frontend and
 * backend are separate deployables) the PAYPAL_EMAIL_PATTERN check in
 * backend/src/middlewares/validate.middleware.js so the UI can reject an
 * obviously-wrong destination before ever sending the request.
 *
 * @param {string} email
 * @returns {boolean}
 */
export function isValidPaypalEmail(email) {
  if (typeof email !== "string") return false;
  const trimmed = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}
