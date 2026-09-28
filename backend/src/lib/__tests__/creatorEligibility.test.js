const {
  MIN_CREATOR_AGE,
  CREATOR_BIRTHDATE_REQUIRED,
  CREATOR_AGE_RESTRICTED,
  CREATOR_ELIGIBILITY_CONSENT_REQUIRED,
  getCreatorAgeEligibilityError,
  getCreatorConsentError,
} = require("../creatorEligibility.js");

const yearsAgo = (years) => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date;
};

describe("getCreatorAgeEligibilityError", () => {
  test("rejects when birthdate is missing", () => {
    const error = getCreatorAgeEligibilityError({ birthdate: null });
    expect(error).toEqual({ code: CREATOR_BIRTHDATE_REQUIRED, message: expect.any(String) });
  });

  test("rejects when calculated age is under the minimum", () => {
    const error = getCreatorAgeEligibilityError({ birthdate: yearsAgo(MIN_CREATOR_AGE - 1) });
    expect(error).toEqual({ code: CREATOR_AGE_RESTRICTED, message: expect.any(String) });
  });

  test("allows a user exactly at the minimum age", () => {
    const error = getCreatorAgeEligibilityError({ birthdate: yearsAgo(MIN_CREATOR_AGE) });
    expect(error).toBeNull();
  });

  test("allows an adult user", () => {
    const error = getCreatorAgeEligibilityError({ birthdate: yearsAgo(30) });
    expect(error).toBeNull();
  });

  test("does not trust an invalid birthdate", () => {
    const error = getCreatorAgeEligibilityError({ birthdate: "not-a-date" });
    expect(error).toEqual({ code: CREATOR_AGE_RESTRICTED, message: expect.any(String) });
  });
});

describe("getCreatorConsentError", () => {
  test("rejects when both confirmations are missing", () => {
    const error = getCreatorConsentError({});
    expect(error).toEqual({ code: CREATOR_ELIGIBILITY_CONSENT_REQUIRED, message: expect.any(String) });
  });

  test("rejects a client-submitted truthy but non-boolean flag", () => {
    const error = getCreatorConsentError({ eligibilityAccepted: "true", creatorRulesAccepted: 1 });
    expect(error).toEqual({ code: CREATOR_ELIGIBILITY_CONSENT_REQUIRED, message: expect.any(String) });
  });

  test("rejects when only one confirmation is accepted", () => {
    const error = getCreatorConsentError({ eligibilityAccepted: true, creatorRulesAccepted: false });
    expect(error).toEqual({ code: CREATOR_ELIGIBILITY_CONSENT_REQUIRED, message: expect.any(String) });
  });

  test("passes when both confirmations are explicitly true", () => {
    const error = getCreatorConsentError({ eligibilityAccepted: true, creatorRulesAccepted: true });
    expect(error).toBeNull();
  });
});
