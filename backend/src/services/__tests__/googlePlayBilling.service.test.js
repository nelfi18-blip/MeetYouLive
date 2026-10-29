"use strict";

// Unit tests for the Google Play Billing service's V2
// (purchases.productsv2.getproductpurchasev2) request + strict response
// normalization/validation. HTTP calls are mocked at the global fetch
// boundary; GoogleAuth is mocked so no real credentials are required.
//
// Response fixtures below follow the OFFICIAL Android Publisher v3 discovery
// schema (ProductPurchaseV2 / ProductLineItem / ProductOfferDetails /
// PurchaseStateContext): `quantity`, `refundableQuantity` and
// `consumptionState` live under `productLineItem[].productOfferDetails`,
// NOT directly on the line item — see
// https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.productsv2

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

// Builds a realistic ProductPurchaseV2 JSON body. `offerDetails` is merged
// into productLineItem[0].productOfferDetails (pass `offerDetails: null` to
// omit productOfferDetails entirely). `lineItems`, when provided, replaces
// productLineItem wholesale (for ambiguity/empty/mismatch cases).
function productPurchaseV2({
  purchaseState = "PURCHASED",
  productId = "coins_pack_100",
  quantity = 1,
  refundableQuantity = 1,
  consumptionState = "CONSUMPTION_STATE_YET_TO_BE_CONSUMED",
  obfuscatedExternalAccountId = "507f1f77bcf86cd799439011",
  offerDetails,
  lineItems,
} = {}) {
  const productOfferDetails =
    offerDetails === null ? undefined : { quantity, refundableQuantity, consumptionState, ...offerDetails };

  return {
    kind: "androidpublisher#productPurchaseV2",
    purchaseStateContext: { purchaseState },
    productLineItem: lineItems !== undefined ? lineItems : [{ productId, productOfferDetails }],
    obfuscatedExternalAccountId,
    orderId: "GPA.1234-5678-9012-34567",
    acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
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

  // --- Happy path: valid PURCHASED purchase ---------------------------------

  test("normalizes a valid PURCHASED, single-line-item response for the requested product", async () => {
    const service = loadFreshService();
    mockFetchOnce(200, productPurchaseV2({ purchaseState: "PURCHASED" }));

    const result = await service.getProductPurchase("coins_pack_100", "token");

    expect(result).toEqual({
      purchaseState: "PURCHASED",
      productId: "coins_pack_100",
      quantity: 1,
      refundableQuantity: 1,
      consumptionState: "CONSUMPTION_STATE_YET_TO_BE_CONSUMED",
      obfuscatedExternalAccountId: "507f1f77bcf86cd799439011",
      orderId: "GPA.1234-5678-9012-34567",
    });
  });

  test.each(["PENDING", "CANCELLED"])("passes through a %s purchaseState without throwing", async (state) => {
    const service = loadFreshService();
    mockFetchOnce(200, productPurchaseV2({ purchaseState: state }));

    const result = await service.getProductPurchase("coins_pack_100", "token");

    expect(result.purchaseState).toBe(state);
  });

  test("normalizes an absent purchaseState to UNSPECIFIED (never PURCHASED)", async () => {
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
    body.purchaseStateContext.purchaseState = "PURCHASE_STATE_UNSPECIFIED";
    mockFetchOnce(200, body);

    const result = await service.getProductPurchase("coins_pack_100", "token");

    expect(result.purchaseState).toBe("UNSPECIFIED");
  });

  // --- Reads quantity/refundableQuantity/consumptionState from the correct
  //     nested productOfferDetails object (the bug being fixed here) -------

  test("reads quantity/refundableQuantity/consumptionState from productLineItem[0].productOfferDetails, not the line item itself", async () => {
    const service = loadFreshService();
    mockFetchOnce(
      200,
      productPurchaseV2({ quantity: 1, refundableQuantity: 1, consumptionState: "CONSUMPTION_STATE_YET_TO_BE_CONSUMED" })
    );

    const result = await service.getProductPurchase("coins_pack_100", "token");

    expect(result.quantity).toBe(1);
    expect(result.refundableQuantity).toBe(1);
    expect(result.consumptionState).toBe("CONSUMPTION_STATE_YET_TO_BE_CONSUMED");
  });

  test("rejects when productOfferDetails is entirely missing from the line item", async () => {
    const service = loadFreshService();
    mockFetchOnce(200, productPurchaseV2({ offerDetails: null }));

    await expect(service.getProductPurchase("coins_pack_100", "token")).rejects.toMatchObject({
      status: 422,
      code: "PURCHASE_OFFER_DETAILS_MISSING",
    });
  });

  test("a fake top-level quantity/refundableQuantity on the line item (wrong schema level) is ignored and still rejected", async () => {
    const service = loadFreshService();
    mockFetchOnce(
      200,
      productPurchaseV2({
        lineItems: [
          {
            productId: "coins_pack_100",
            // Deliberately placed at the WRONG level (legacy V1 style) —
            // must NOT be read from here.
            quantity: 1,
            refundableQuantity: 1,
            consumptionState: "CONSUMPTION_STATE_YET_TO_BE_CONSUMED",
          },
        ],
      })
    );

    await expect(service.getProductPurchase("coins_pack_100", "token")).rejects.toMatchObject({
      status: 422,
      code: "PURCHASE_OFFER_DETAILS_MISSING",
    });
  });

  // --- Refunded purchases ----------------------------------------------------

  test("normalizes a refunded purchase (refundableQuantity: 0) without throwing, so the controller can reject it", async () => {
    const service = loadFreshService();
    mockFetchOnce(200, productPurchaseV2({ refundableQuantity: 0 }));

    const result = await service.getProductPurchase("coins_pack_100", "token");

    expect(result.refundableQuantity).toBe(0);
  });

  test("rejects when refundableQuantity is missing (never assumed non-refunded)", async () => {
    const service = loadFreshService();
    mockFetchOnce(200, productPurchaseV2({ offerDetails: { refundableQuantity: undefined } }));

    await expect(service.getProductPurchase("coins_pack_100", "token")).rejects.toMatchObject({
      status: 422,
      code: "PURCHASE_REFUND_STATE_UNKNOWN",
    });
  });

  // --- Previously-consumed purchases -----------------------------------------

  test("normalizes a previously-consumed purchase (CONSUMPTION_STATE_CONSUMED) without throwing, so the controller can decide", async () => {
    const service = loadFreshService();
    mockFetchOnce(200, productPurchaseV2({ consumptionState: "CONSUMPTION_STATE_CONSUMED" }));

    const result = await service.getProductPurchase("coins_pack_100", "token");

    expect(result.consumptionState).toBe("CONSUMPTION_STATE_CONSUMED");
  });

  test("normalizes a missing/unrecognized consumptionState to UNSPECIFIED", async () => {
    const service = loadFreshService();
    mockFetchOnce(200, productPurchaseV2({ offerDetails: { consumptionState: undefined } }));

    const result = await service.getProductPurchase("coins_pack_100", "token");

    expect(result.consumptionState).toBe("UNSPECIFIED");
  });

  // --- Ambiguous / mismatched line items --------------------------------------

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
          { productId: "coins_pack_100", productOfferDetails: { quantity: 1, refundableQuantity: 1 } },
          { productId: "coins_pack_250", productOfferDetails: { quantity: 1, refundableQuantity: 1 } },
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
      productPurchaseV2({
        lineItems: [{ productId: "", productOfferDetails: { quantity: 1, refundableQuantity: 1 } }],
      })
    );

    await expect(service.getProductPurchase("coins_pack_100", "token")).rejects.toMatchObject({
      status: 422,
      code: "PURCHASE_PRODUCT_MISMATCH",
    });
  });

  // --- Invalid / missing quantity ---------------------------------------------

  test.each([0, 2, 5])("rejects an unexpected purchase quantity (%i)", async (quantity) => {
    const service = loadFreshService();
    mockFetchOnce(200, productPurchaseV2({ quantity }));

    await expect(service.getProductPurchase("coins_pack_100", "token")).rejects.toMatchObject({
      status: 422,
      code: "PURCHASE_QUANTITY_INVALID",
    });
  });

  test("rejects when quantity is missing entirely (never silently defaulted to 1)", async () => {
    const service = loadFreshService();
    mockFetchOnce(200, productPurchaseV2({ offerDetails: { quantity: undefined } }));

    await expect(service.getProductPurchase("coins_pack_100", "token")).rejects.toMatchObject({
      status: 422,
      code: "PURCHASE_QUANTITY_INVALID",
    });
  });

  test("rejects a non-integer quantity", async () => {
    const service = loadFreshService();
    mockFetchOnce(200, productPurchaseV2({ offerDetails: { quantity: "1" } }));

    await expect(service.getProductPurchase("coins_pack_100", "token")).rejects.toMatchObject({
      status: 422,
      code: "PURCHASE_QUANTITY_INVALID",
    });
  });

  // --- Transport-level errors --------------------------------------------------

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

  // --- Idempotent re-fetch: calling again for the same token is a pure, safe
  //     read and yields the same normalized result (no state mutation) ------

  test("repeated calls for the same purchaseToken are idempotent reads (no caching/side effects, same normalized result)", async () => {
    const service = loadFreshService();
    mockFetchOnce(200, productPurchaseV2());

    const first = await service.getProductPurchase("coins_pack_100", "token");

    mockFetchOnce(200, productPurchaseV2());
    const second = await service.getProductPurchase("coins_pack_100", "token");

    expect(second).toEqual(first);
  });

  // --- Configuration -------------------------------------------------------

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
