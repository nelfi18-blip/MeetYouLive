"use strict";

// payoutRequestSchema — PayPal destination validation.
//
// A creator must never be able to request a "paypal" payout without
// providing a valid-looking destination email: there would be nothing for
// the admin to manually pay out to (see requestPayout/markWithdrawalPaid in
// creator.controller.js / withdraw.controller.js, which only record the
// external reference after a human-verified manual transfer).
//
// Other payout methods (stripe, zelle, bank, other) keep their previous,
// more permissive behavior — this task only tightens the "paypal" case.

const { payoutRequestSchema } = require("../validate.middleware.js");

describe("payoutRequestSchema — paypal destination validation", () => {
  test("rejects a paypal request with no paymentDetails at all", () => {
    const result = payoutRequestSchema.safeParse({ method: "paypal" });
    expect(result.success).toBe(false);
    expect(result.error.errors[0].path).toEqual(["paymentDetails"]);
  });

  test("rejects a paypal request with an empty paymentDetails string", () => {
    const result = payoutRequestSchema.safeParse({ method: "paypal", paymentDetails: "" });
    expect(result.success).toBe(false);
  });

  test("rejects a paypal request whose paymentDetails is not a valid email", () => {
    const result = payoutRequestSchema.safeParse({ method: "paypal", paymentDetails: "not-an-email" });
    expect(result.success).toBe(false);
  });

  test("rejects a paypal request with only whitespace as paymentDetails", () => {
    const result = payoutRequestSchema.safeParse({ method: "paypal", paymentDetails: "   " });
    expect(result.success).toBe(false);
  });

  test("accepts a paypal request with a valid email and trims it", () => {
    const result = payoutRequestSchema.safeParse({
      method: "paypal",
      paymentDetails: "  creator@example.com  ",
    });
    expect(result.success).toBe(true);
    expect(result.data.paymentDetails).toBe("creator@example.com");
    expect(result.data.method).toBe("paypal");
  });

  test("does not require paymentDetails for non-paypal methods (back-compat)", () => {
    const result = payoutRequestSchema.safeParse({ method: "stripe" });
    expect(result.success).toBe(true);
    expect(result.data.paymentDetails).toBe("");
  });

  test("rejects an unknown payment method", () => {
    const result = payoutRequestSchema.safeParse({ method: "venmo", paymentDetails: "a@b.com" });
    expect(result.success).toBe(false);
  });
});
