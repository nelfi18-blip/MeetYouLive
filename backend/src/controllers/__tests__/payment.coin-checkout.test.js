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

  test("coin purchase schema rejects invalid packageId values", () => {
    const nonInteger = coinPurchaseSchema.safeParse({ packageId: 100.5 });
    expect(nonInteger.success).toBe(false);
    expect(nonInteger.error.errors[0].message).toBe("packageId debe ser un número entero");

    const negative = coinPurchaseSchema.safeParse({ packageId: -100 });
    expect(negative.success).toBe(false);
    expect(negative.error.errors[0].message).toBe("packageId debe ser un número positivo");

    const nonNumber = coinPurchaseSchema.safeParse({ packageId: "100" });
    expect(nonNumber.success).toBe(false);
    expect(nonNumber.error.errors[0].message).toBe("packageId debe ser un número");
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

  test("rejects a non-existent coin package before creating a Stripe Checkout session", async () => {
    const req = {
      body: { packageId: 999 },
      userId: "user-123",
    };
    const res = createMockResponse();

    await createCoinCheckoutSession(req, res);

    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "Paquete de monedas inválido. Usa 100, 250, 700" });
  });
});
