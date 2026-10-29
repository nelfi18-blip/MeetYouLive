"use strict";

// Unit tests for the Google Play Billing service's V2
// (purchases.productsv2.getproductpurchasev2) request + strict response
// normalization/validation. HTTP calls are mocked at the global fetch
// boundary; GoogleAuth is mocked so no real credentials are required.

jest.mock("google-auth-library", () => ({
  GoogleAuth: jest.fn().mockImplementation(() => ({
    getClient: jest.fn().mockResolvedValue({
      getAccessToken: jest.fn().mockResolvedValue({ token: "fake-access-token" }),
    }),
  })),
}));

const ORIGINAL_ENV = { ...process.env };

function setEnv() {
  process.env.GOOGLE_PLAY_CLIENT_EMAIL = "svc@example-project.iam.gserviceaccount.com";
  process.env.GOOGLE_PLAY_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----\\n";
  process.env.GOOGLE_PLAY_PACKAGE_NAME = "com.meetyoulive.app";
}

function loadFreshService() {
  jest.resetModules();
  return require("../googlePlayBilling.service.js");
}

function mockFetchOnce(status, body) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  });
}

function productPurchaseV2({
  purchaseState = "PURCHASED",
  productId = "coins_pack_100",
  quantity = 1,
  refundableQuantity = 1,
  consumptionState = 0,
  obfuscatedExternalAccountId = "507f1f77bcf86cd799439011",
  lineItems,
} = {}) {
  return {
    purchaseStateContext: { purchaseState },
    productLineItem:
      lineItems !== undefined ? lineItems : [{ productId, quantity, refundableQuantity, consumptionState }],
    obfuscatedExternalAccountId,
    orderId: "GPA.1234-5678-9012-34567",
  };
}

describe("googlePlayBilling.service (V2 productsv2 verification)", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    setEnv();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test("calls the V2 productsv2 tokens endpoint (not the legacy V1 products endpoint)", async () => {
    const service = loadFreshService();
    mockFetchOnce(200, productPurchaseV2());

    await service.getProductPurchase("coins_pack_100", "opaque-token-abc");

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain("/applications/com.meetyoulive.app/purchases/productsv2/tokens/opaque-token-abc");
    expect(url).not.toContain("/purchases/products/");
  });

  test("normalizes a PURCHASED, single-line-item response for the requested product", async () => {
    const service = loadFreshService();
    mockFetchOnce(200, productPurchaseV2({ purchaseState: "PURCHASED" }));

    const result = await service.getProductPurchase("coins_pack_100", "token");

    expect(result).toEqual(
      expect.objectContaining({
        purchaseState: "PURCHASED",
        productId: "coins_pack_100",
        quantity: 1,
        refundableQuantity: 1,
        obfuscatedExternalAccountId: "507f1f77bcf86cd799439011",
        orderId: "GPA.1234-5678-9012-34567",
      })
    );
  });

  test.each(["PENDING", "CANCELLED"])("passes through a %s purchaseState without throwing", async (state) => {
    const service = loadFreshService();
    mockFetchOnce(200, productPurchaseV2({ purchaseState: state }));

    const result = await service.getProductPurchase("coins_pack_100", "token");

    expect(result.purchaseState).toBe(state);
  });

  test("normalizes an absent/unrecognized purchaseState to UNSPECIFIED (never PURCHASED)", async () => {
    const service = loadFreshService();
    const body = productPurchaseV2();
    delete body.purchaseStateContext.purchaseState;
    mockFetchOnce(200, body);

    const result = await service.getProductPurchase("coins_pack_100", "token");

    expect(result.purchaseState).toBe("UNSPECIFIED");
  });

  test("normalizes an unrecognized purchaseState string to UNSPECIFIED (never PURCHASED)", async () => {
    const service = loadFreshService();
    const body = productPurchaseV2();
    body.purchaseStateContext.purchaseState = "SOME_FUTURE_STATE";
    mockFetchOnce(200, body);

    const result = await service.getProductPurchase("coins_pack_100", "token");

    expect(result.purchaseState).toBe("UNSPECIFIED");
  });

  test("rejects when productLineItem is empty", async () => {
    const service = loadFreshService();
    mockFetchOnce(200, productPurchaseV2({ lineItems: [] }));

    await expect(service.getProductPurchase("coins_pack_100", "token")).rejects.toMatchObject({
      status: 422,
      code: "PURCHASE_LINE_ITEMS_AMBIGUOUS",
    });
  });

  test("rejects when productLineItem has more than one entry", async () => {
    const service = loadFreshService();
    mockFetchOnce(
      200,
      productPurchaseV2({
        lineItems: [
          { productId: "coins_pack_100", quantity: 1, refundableQuantity: 1 },
          { productId: "coins_pack_250", quantity: 1, refundableQuantity: 1 },
        ],
      })
    );

    await expect(service.getProductPurchase("coins_pack_100", "token")).rejects.toMatchObject({
      status: 422,
      code: "PURCHASE_LINE_ITEMS_AMBIGUOUS",
    });
  });

  test("rejects when the single productLineItem is for a different product", async () => {
    const service = loadFreshService();
    mockFetchOnce(200, productPurchaseV2({ productId: "coins_pack_250" }));

    await expect(service.getProductPurchase("coins_pack_100", "token")).rejects.toMatchObject({
      status: 422,
      code: "PURCHASE_PRODUCT_MISMATCH",
    });
  });

  test("rejects when the productLineItem's productId is empty/missing", async () => {
    const service = loadFreshService();
    mockFetchOnce(
      200,
      productPurchaseV2({ lineItems: [{ productId: "", quantity: 1, refundableQuantity: 1 }] })
    );

    await expect(service.getProductPurchase("coins_pack_100", "token")).rejects.toMatchObject({
      status: 422,
      code: "PURCHASE_PRODUCT_MISMATCH",
    });
  });

  test.each([0, 2, 5])("rejects an unexpected purchase quantity (%i)", async (quantity) => {
    const service = loadFreshService();
    mockFetchOnce(200, productPurchaseV2({ quantity }));

    await expect(service.getProductPurchase("coins_pack_100", "token")).rejects.toMatchObject({
      status: 422,
      code: "PURCHASE_QUANTITY_INVALID",
    });
  });

  test("defaults quantity to 1 when the field is absent (per Google's documented default)", async () => {
    const service = loadFreshService();
    mockFetchOnce(
      200,
      productPurchaseV2({ lineItems: [{ productId: "coins_pack_100", refundableQuantity: 1 }] })
    );

    const result = await service.getProductPurchase("coins_pack_100", "token");

    expect(result.quantity).toBe(1);
  });

  test("normalizes refundableQuantity to null when the field is absent (not assumed to be fully refundable)", async () => {
    const service = loadFreshService();
    mockFetchOnce(
      200,
      productPurchaseV2({ lineItems: [{ productId: "coins_pack_100", quantity: 1 }] })
    );

    const result = await service.getProductPurchase("coins_pack_100", "token");

    expect(result.refundableQuantity).toBeNull();
  });

  test("surfaces a 404 from Google Play as a thrown error with .status = 404 (never credits)", async () => {
    const service = loadFreshService();
    mockFetchOnce(404, { error: { message: "No application was found for the given package name." } });

    await expect(service.getProductPurchase("coins_pack_100", "token")).rejects.toMatchObject({
      status: 404,
    });
  });

  test("surfaces a 5xx from Google Play as a thrown error with the original status", async () => {
    const service = loadFreshService();
    mockFetchOnce(503, { error: { message: "Backend Error" } });

    await expect(service.getProductPurchase("coins_pack_100", "token")).rejects.toMatchObject({
      status: 503,
    });
  });

  test("isConfigured() is false when any required env var is missing", () => {
    delete process.env.GOOGLE_PLAY_PACKAGE_NAME;
    const service = loadFreshService();
    expect(service.isConfigured()).toBe(false);
  });

  test("isConfigured() is true when all required env vars are present", () => {
    const service = loadFreshService();
    expect(service.isConfigured()).toBe(true);
  });

  test("consumeProductPurchase still calls the legacy (non-V2) consume endpoint", async () => {
    const service = loadFreshService();
    mockFetchOnce(200, {});

    await service.consumeProductPurchase("coins_pack_100", "opaque-token-abc");

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain("/purchases/products/coins_pack_100/tokens/opaque-token-abc:consume");
    expect(options.method).toBe("POST");
  });
});
