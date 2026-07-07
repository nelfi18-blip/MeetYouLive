"use strict";

const mockCreateCheckoutSession = jest.fn();

jest.mock("stripe", () =>
  jest.fn(() => ({
    checkout: {
      sessions: {
        create: mockCreateCheckoutSession,
      },
    },
  }))
);

const { createCoinCheckoutSession } = require("../payment.controller.js");
const { coinPurchaseSchema } = require("../../middlewares/validate.middleware.js");

function createMockResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
}

describe("coin checkout", () => {
  beforeEach(() => {
    mockCreateCheckoutSession.mockReset();
    process.env.FRONTEND_URL = "https://example.com";
  });

  test("coin purchase schema accepts packageId and rejects missing values with a clear message", () => {
    expect(coinPurchaseSchema.safeParse({ packageId: 100 }).success).toBe(true);

    const result = coinPurchaseSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error.errors[0].message).toBe("packageId es requerido");
  });

  test("creates a Stripe Checkout session for a valid coin package", async () => {
    mockCreateCheckoutSession.mockResolvedValue({ url: "https://checkout.stripe.test/session" });

    const req = {
      body: { packageId: 100 },
      userId: "user-123",
    };
    const res = createMockResponse();

    await createCoinCheckoutSession(req, res);

    expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        metadata: {
          userId: "user-123",
          packageId: "100",
          coins: "100",
          type: "coins",
        },
        success_url: "https://example.com/payment/success?token={CHECKOUT_SESSION_ID}",
        cancel_url: "https://example.com/payment/cancel",
      })
    );
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ url: "https://checkout.stripe.test/session" });
  });
});
