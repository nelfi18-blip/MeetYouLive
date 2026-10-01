/**
 * SMS sending abstraction for phone verification.
 *
 * ⚠️ PRODUCTION STATUS: only the verification INFRASTRUCTURE (model fields,
 * OTP generation/expiry, rate limiting, endpoints, masking) is implemented in
 * this PR. No real SMS provider is wired up yet — `SMS_PROVIDER` is
 * intentionally left unconfigured. This feature MUST NOT be considered
 * operational/production-ready until a real provider is connected here.
 *
 * This module defines a clear seam so a real provider (Twilio, Vonage, AWS
 * SNS, etc.) can be plugged in later by implementing `dispatchSms()` and
 * configuring the relevant env vars (e.g. `SMS_PROVIDER` plus that
 * provider's own credentials) — deliberately NOT added in this change, to
 * avoid introducing unreviewed third-party dependencies/credentials.
 *
 * Safety contract: if no provider is configured (or dispatch fails), this
 * module MUST throw — callers must never tell the user an SMS was sent when
 * it wasn't. Never log the OTP code itself.
 */

class SmsServiceError extends Error {
  constructor(code, message, status = 503) {
    super(message);
    this.name = "SmsServiceError";
    this.code = code;
    this.status = status;
  }
}

function getSmsConfigSummary() {
  const provider = process.env.SMS_PROVIDER || "";
  return {
    provider: provider || "unconfigured",
    configured: Boolean(provider),
  };
}

/**
 * Resolve and validate the configured SMS provider. Throws a SmsServiceError
 * when nothing is configured, or when the configured provider has no
 * implementation yet.
 */
function assertSmsProviderConfigured() {
  const provider = process.env.SMS_PROVIDER;
  if (!provider) {
    throw new SmsServiceError(
      "SMS_NOT_CONFIGURED",
      "El servicio de SMS no está configurado. Define SMS_PROVIDER y las credenciales del proveedor para habilitar la verificación por teléfono."
    );
  }

  // Placeholder seam for a real provider integration. Intentionally not
  // implemented in this PR — only the abstraction is introduced so the real
  // provider can be connected without touching the calling code.
  throw new SmsServiceError(
    "SMS_PROVIDER_NOT_IMPLEMENTED",
    `El proveedor de SMS "${provider}" no está implementado todavía.`
  );
}

/**
 * Send a raw SMS message. Real implementations should call the provider SDK
 * here. Never resolve successfully unless the provider confirmed dispatch.
 */
async function dispatchSms(_to, _body) {
  assertSmsProviderConfigured();
}

/**
 * Send a phone verification code via SMS.
 * Throws SmsServiceError when the SMS provider is not configured/available;
 * callers must surface this as an explicit failure, never a false "sent".
 */
async function sendPhoneVerificationSms(phoneE164, code) {
  const body = `MeetYouLive: tu código de verificación es ${code}. Caduca en 10 minutos. No lo compartas con nadie.`;
  await dispatchSms(phoneE164, body);
}

module.exports = {
  SmsServiceError,
  getSmsConfigSummary,
  sendPhoneVerificationSms,
};
