"use strict";

const { payoutProfileUpdateSchema, payoutRequestSchema } = require("../validate.middleware.js");
const {
  PREFERRED_PAYOUT_METHODS,
  isDestinationStepComplete,
  isPayoutProfileComplete,
} = require("../../lib/creatorPayoutProfile.js");

describe("creator preferred payout method (informational only)", () => {
  test.each(["paypal", "zelle", "ach", "wise", "payoneer"])("accepts a preference-only update: %s", (preferredPayoutMethod) => {
    const parsed = payoutProfileUpdateSchema.safeParse({ preferredPayoutMethod });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ preferredPayoutMethod });
    expect(PREFERRED_PAYOUT_METHODS).toContain(preferredPayoutMethod);
  });

  test("rejects unknown methods and attempts to make Zelle or bank the active destination", () => {
    for (const bad of ["", "crypto", "bank", "wire", "other", null, 5]) {
      expect(payoutProfileUpdateSchema.safeParse({ preferredPayoutMethod: bad }).success).toBe(false);
    }
    for (const active of ["zelle", "ach", "wise", "payoneer"]) {
      expect(payoutProfileUpdateSchema.safeParse({ destinationMethod: active }).success).toBe(false);
    }
  });

  test("a future-method preference alone never completes a payout destination", () => {
    for (const method of ["zelle", "ach", "wise", "payoneer"]) {
      const profile = {
        legalName: "Jane Doe", residenceCountry: "US",
        taxResidenceCountry: "US", beneficiaryType: "individual",
        destinationMethod: "paypal", paypalEmail: "",
        preferredPayoutMethod: method,
      };
      expect(isDestinationStepComplete(profile)).toBe(false);
      expect(isPayoutProfileComplete(profile)).toBe(false);
      // The legacy request enum recognizes "zelle", but the controller
      // still rejects it until a destination/provider is truly supported.
      // ACH/Wise/Payoneer aren't even accepted at schema level.
      expect(payoutRequestSchema.safeParse({ method, paymentDetails: "test@example.com" }).success)
        .toBe(method === "zelle");
    }
  });

  test("existing PayPal profile remains complete regardless of informational preference", () => {
    const profile = {
      legalName: "Jane Doe", residenceCountry: "US",
      taxResidenceCountry: "US", beneficiaryType: "individual",
      destinationMethod: "paypal", paypalEmail: "jane@example.com",
      preferredPayoutMethod: "zelle",
    };
    expect(isPayoutProfileComplete(profile)).toBe(true);
    expect(isDestinationStepComplete(profile)).toBe(true);
  });
});
