/**
 * Creator eligibility gateway.
 *
 * Reuses the canonical `birthdate` field and `calculateAge()` helper that
 * MeetYouLive already uses everywhere else — this does NOT introduce a
 * second age system. It only adds an explicit, backend-enforced gate in
 * front of the Creator request flow.
 */
const { calculateAge } = require("./age.js");

const MIN_CREATOR_AGE = 18;

// Bump this when the creator eligibility/consent copy changes so accepted
// consents can be traced back to the exact rules the user agreed to.
const CREATOR_ELIGIBILITY_VERSION = "2025-01";

const CREATOR_BIRTHDATE_REQUIRED = "CREATOR_BIRTHDATE_REQUIRED";
const CREATOR_AGE_RESTRICTED = "CREATOR_AGE_RESTRICTED";
const CREATOR_ELIGIBILITY_CONSENT_REQUIRED = "CREATOR_ELIGIBILITY_CONSENT_REQUIRED";

/**
 * Validates that the user meets the 18+ Creator eligibility requirement
 * using the user's stored birthdate. The backend is the sole authority —
 * a client-submitted "I am 18" flag is never trusted on its own.
 *
 * @param {Object} user - Mongoose User document (must include `birthdate`)
 * @returns {{code: string, message: string} | null} error descriptor, or null if eligible
 */
const getCreatorAgeEligibilityError = (user) => {
  if (!user?.birthdate) {
    return {
      code: CREATOR_BIRTHDATE_REQUIRED,
      message: "Debes completar tu fecha de nacimiento en tu perfil antes de solicitar ser creador.",
    };
  }

  const age = calculateAge(user.birthdate, new Date());
  if (age === null || age < MIN_CREATOR_AGE) {
    return {
      code: CREATOR_AGE_RESTRICTED,
      message: "El acceso a creadores está disponible únicamente para mayores de 18 años.",
    };
  }

  return null;
};

/**
 * Validates that the user has explicitly accepted the Creator eligibility
 * consent (18+ confirmation) and the Creator rules/monetization consent.
 * Both must be booleans equal to `true` — never inferred or defaulted.
 *
 * @param {Object} body - request body
 * @returns {{code: string, message: string} | null}
 */
const getCreatorConsentError = (body) => {
  const eligibilityAccepted = body?.eligibilityAccepted === true;
  const creatorRulesAccepted = body?.creatorRulesAccepted === true;

  if (!eligibilityAccepted || !creatorRulesAccepted) {
    return {
      code: CREATOR_ELIGIBILITY_CONSENT_REQUIRED,
      message: "Debes confirmar que tienes al menos 18 años y que aceptas las reglas para creadores.",
    };
  }

  return null;
};

module.exports = {
  MIN_CREATOR_AGE,
  CREATOR_ELIGIBILITY_VERSION,
  CREATOR_BIRTHDATE_REQUIRED,
  CREATOR_AGE_RESTRICTED,
  CREATOR_ELIGIBILITY_CONSENT_REQUIRED,
  getCreatorAgeEligibilityError,
  getCreatorConsentError,
};
