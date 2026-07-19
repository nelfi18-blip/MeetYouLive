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

const Purchase = require("../../models/Purchase.js");
const { createCoinCheckoutSession, handlePaymentCompleted } = require("../payment.controller.js");
const { validate, coinPurchaseSchema } = require("../../middlewares/validate.middleware.js");

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
    process.env.STRIPE_SECRET_KEY = "sk_test_unit";
  });

  describe("video purchase webhook safety", () => {
    const userId = "507f1f77bcf86cd799439011";
    const videoId = "507f1f77bcf86cd799439012";

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test("rejects invalid video purchase amounts before writing a purchase", async () => {
      const upsertSpy = jest.spyOn(Purchase, "findOneAndUpdate").mockResolvedValue(null);

      await expect(
        handlePaymentCompleted({
          id: "cs_test_bad_amount",
          mode: "payment",
          metadata: { type: "video", userId, videoId, amount: "not-a-number" },
        })
      ).rejects.toThrow("Invalid video purchase amount");

      expect(upsertSpy).not.toHaveBeenCalled();
    });

    test("records video purchases with an idempotent upsert", async () => {
      const purchaseId = "507f1f77bcf86cd799439099";
      const upsertSpy = jest.spyOn(Purchase, "findOneAndUpdate").mockResolvedValue({ _id: purchaseId });

      await handlePaymentCompleted({
        id: "cs_test_video",
        mode: "payment",
        metadata: { type: "video", userId, videoId, amount: "4.99" },
      });

      expect(upsertSpy).toHaveBeenCalledWith(
        { stripeSessionId: "cs_test_video" },
        {
          $setOnInsert: {
            user: userId,
            video: videoId,
            amount: 4.99,
            stripeSessionId: "cs_test_video",
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
    });
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

  test("validation middleware rejects invalid coin checkout requests before the controller", () => {
    const req = { body: {} };
    const res = createMockResponse();
    const next = jest.fn();

    validate(coinPurchaseSchema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "packageId es requerido",
      errors: [{ field: "packageId", message: "packageId es requerido" }],
    });
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
