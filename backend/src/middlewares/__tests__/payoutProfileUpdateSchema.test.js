"use strict";

// payoutProfileUpdateSchema — validates PATCH /api/creator/payout-profile.
//
// Every field is optional (step 1 and step 2 can be saved independently),
// but when present each field must be well-formed, and an empty body (no
// recognized fields at all) must be rejected rather than silently accepted
// as a no-op PATCH.

const { payoutProfileUpdateSchema } = require("../validate.middleware.js");

describe("payoutProfileUpdateSchema", () => {
  test("rejects a completely empty body", () => {
    const result = payoutProfileUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  test("accepts step 1 (beneficiary) fields alone", () => {
    const result = payoutProfileUpdateSchema.safeParse({
      legalName: "Jane Doe",
      residenceCountry: "us",
      taxResidenceCountry: "us",
      beneficiaryType: "individual",
    });
    expect(result.success).toBe(true);
    // Country codes are coerced to uppercase.
    expect(result.data.residenceCountry).toBe("US");
    expect(result.data.taxResidenceCountry).toBe("US");
  });

  test("accepts step 2 (destination) fields alone", () => {
    const result = payoutProfileUpdateSchema.safeParse({
      destinationMethod: "paypal",
      paypalEmail: "creator@example.com",
    });
    expect(result.success).toBe(true);
  });

  test("rejects an invalid country code (not 2 letters)", () => {
    const result = payoutProfileUpdateSchema.safeParse({ residenceCountry: "USA" });
    expect(result.success).toBe(false);
    expect(result.error.errors[0].path).toEqual(["residenceCountry"]);
  });

  test("rejects an invalid beneficiaryType", () => {
    const result = payoutProfileUpdateSchema.safeParse({ beneficiaryType: "trust" });
    expect(result.success).toBe(false);
  });

  test("rejects an empty paypalEmail when the key is present", () => {
    const result = payoutProfileUpdateSchema.safeParse({ paypalEmail: "" });
    expect(result.success).toBe(false);
    expect(result.error.errors[0].path).toEqual(["paypalEmail"]);
  });

  test("rejects a malformed paypalEmail (no domain/TLD)", () => {
    const result = payoutProfileUpdateSchema.safeParse({ paypalEmail: "not-an-email" });
    expect(result.success).toBe(false);
  });

  test("rejects a destinationMethod other than paypal", () => {
    const result = payoutProfileUpdateSchema.safeParse({ destinationMethod: "bank" });
    expect(result.success).toBe(false);
  });

  test("rejects a legalName shorter than 2 characters", () => {
    const result = payoutProfileUpdateSchema.safeParse({ legalName: "A" });
    expect(result.success).toBe(false);
  });

  test("rejects a legalName longer than 120 characters", () => {
    const result = payoutProfileUpdateSchema.safeParse({ legalName: "A".repeat(121) });
    expect(result.success).toBe(false);
  });

  test("trims legalName", () => {
    const result = payoutProfileUpdateSchema.safeParse({ legalName: "  Jane Doe  " });
    expect(result.success).toBe(true);
    expect(result.data.legalName).toBe("Jane Doe");
  });
});
