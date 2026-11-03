"use strict";

// Verifies appleStoreKit.service.js's strict, fail-closed normalization of
// decoded App Store transactions, and its isConfigured() gating — without
// ever making a real network call to Apple.

const mockGetTransactionInfo = jest.fn();
const mockVerifyAndDecodeTransaction = jest.fn();

jest.mock("@apple/app-store-server-library", () => ({
  AppStoreServerAPIClient: jest.fn().mockImplementation(() => ({
    getTransactionInfo: mockGetTransactionInfo,
  })),
  SignedDataVerifier: jest.fn().mockImplementation(() => ({
    verifyAndDecodeTransaction: mockVerifyAndDecodeTransaction,
  })),
  Environment: { SANDBOX: "Sandbox", PRODUCTION: "Production" },
}));

const ORIGINAL_ENV = { ...process.env };

function setConfiguredEnv() {
  process.env.APPLE_IAP_PRIVATE_KEY = "fake-private-key";
  process.env.APPLE_IAP_KEY_ID = "KEYID123";
  process.env.APPLE_IAP_ISSUER_ID = "issuer-123";
  process.env.APPLE_IAP_BUNDLE_ID = "com.meetyoulive.app";
  process.env.APPLE_IAP_ENVIRONMENT = "sandbox";
  process.env.APPLE_IAP_ROOT_CERTS_BASE64 = Buffer.from("fake-cert").toString("base64");
}

function clearConfiguredEnv() {
  delete process.env.APPLE_IAP_PRIVATE_KEY;
  delete process.env.APPLE_IAP_KEY_ID;
  delete process.env.APPLE_IAP_ISSUER_ID;
  delete process.env.APPLE_IAP_BUNDLE_ID;
  delete process.env.APPLE_IAP_ENVIRONMENT;
  delete process.env.APPLE_IAP_ROOT_CERTS_BASE64;
}

describe("appleStoreKit.service", () => {
  let appleStoreKit;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    clearConfiguredEnv();
    appleStoreKit = require("../appleStoreKit.service.js");
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  function validDecoded(overrides = {}) {
    return {
      transactionId: "2000000123456789",
      originalTransactionId: "2000000123456789",
      productId: "coins_pack_100",
      type: "Consumable",
      quantity: 1,
      appAccountToken: "11111111-1111-5111-8111-111111111111",
      environment: "Sandbox",
      ...overrides,
    };
  }

  test("isConfigured() is false when any required env var is missing", () => {
    expect(appleStoreKit.isConfigured()).toBe(false);
    setConfiguredEnv();
    delete process.env.APPLE_IAP_KEY_ID;
    jest.resetModules();
    appleStoreKit = require("../appleStoreKit.service.js");
    expect(appleStoreKit.isConfigured()).toBe(false);
  });

  test("isConfigured() is true when all required env vars are present", () => {
    setConfiguredEnv();
    jest.resetModules();
    appleStoreKit = require("../appleStoreKit.service.js");
    expect(appleStoreKit.isConfigured()).toBe(true);
  });

  test("getVerifiedTransaction credits path: returns normalized fields for a valid Consumable transaction", async () => {
    setConfiguredEnv();
    jest.resetModules();
    appleStoreKit = require("../appleStoreKit.service.js");
    mockGetTransactionInfo.mockResolvedValue({ signedTransactionInfo: "signed-jws" });
    mockVerifyAndDecodeTransaction.mockResolvedValue(validDecoded());

    const result = await appleStoreKit.getVerifiedTransaction("2000000123456789", "coins_pack_100");

    expect(result).toEqual(
      expect.objectContaining({
        transactionId: "2000000123456789",
        productId: "coins_pack_100",
        quantity: 1,
        appAccountToken: "11111111-1111-5111-8111-111111111111",
        refunded: false,
      })
    );
  });

  test("rejects a productId mismatch (fail closed, never credits)", async () => {
    setConfiguredEnv();
    jest.resetModules();
    appleStoreKit = require("../appleStoreKit.service.js");
    mockGetTransactionInfo.mockResolvedValue({ signedTransactionInfo: "signed-jws" });
    mockVerifyAndDecodeTransaction.mockResolvedValue(validDecoded({ productId: "coins_pack_250" }));

    await expect(appleStoreKit.getVerifiedTransaction("tx", "coins_pack_100")).rejects.toMatchObject({
      status: 422,
      code: "PURCHASE_PRODUCT_MISMATCH",
    });
  });

  test("rejects a non-Consumable transaction type", async () => {
    setConfiguredEnv();
    jest.resetModules();
    appleStoreKit = require("../appleStoreKit.service.js");
    mockGetTransactionInfo.mockResolvedValue({ signedTransactionInfo: "signed-jws" });
    mockVerifyAndDecodeTransaction.mockResolvedValue(validDecoded({ type: "Non-Consumable" }));

    await expect(appleStoreKit.getVerifiedTransaction("tx", "coins_pack_100")).rejects.toMatchObject({
      status: 422,
      code: "PURCHASE_TYPE_INVALID",
    });
  });

  test("rejects a missing/non-1 quantity rather than assuming 1", async () => {
    setConfiguredEnv();
    jest.resetModules();
    appleStoreKit = require("../appleStoreKit.service.js");
    mockGetTransactionInfo.mockResolvedValue({ signedTransactionInfo: "signed-jws" });
    mockVerifyAndDecodeTransaction.mockResolvedValue(validDecoded({ quantity: undefined }));

    await expect(appleStoreKit.getVerifiedTransaction("tx", "coins_pack_100")).rejects.toMatchObject({
      status: 422,
      code: "PURCHASE_QUANTITY_INVALID",
    });

    mockVerifyAndDecodeTransaction.mockResolvedValue(validDecoded({ quantity: 2 }));
    await expect(appleStoreKit.getVerifiedTransaction("tx", "coins_pack_100")).rejects.toMatchObject({
      status: 422,
      code: "PURCHASE_QUANTITY_INVALID",
    });
  });

  test("rejects a missing appAccountToken (never treated as proof of ownership)", async () => {
    setConfiguredEnv();
    jest.resetModules();
    appleStoreKit = require("../appleStoreKit.service.js");
    mockGetTransactionInfo.mockResolvedValue({ signedTransactionInfo: "signed-jws" });
    mockVerifyAndDecodeTransaction.mockResolvedValue(validDecoded({ appAccountToken: undefined }));

    await expect(appleStoreKit.getVerifiedTransaction("tx", "coins_pack_100")).rejects.toMatchObject({
      status: 422,
      code: "PURCHASE_ACCOUNT_TOKEN_MISSING",
    });
  });

  test("flags a transaction with a revocationDate/revocationReason as refunded", async () => {
    setConfiguredEnv();
    jest.resetModules();
    appleStoreKit = require("../appleStoreKit.service.js");
    mockGetTransactionInfo.mockResolvedValue({ signedTransactionInfo: "signed-jws" });
    mockVerifyAndDecodeTransaction.mockResolvedValue(
      validDecoded({ revocationDate: Date.now(), revocationReason: 1 })
    );

    const result = await appleStoreKit.getVerifiedTransaction("tx", "coins_pack_100");
    expect(result.refunded).toBe(true);
  });

  test("propagates a lookup failure (e.g. unknown transaction) as a safe error without crediting", async () => {
    setConfiguredEnv();
    jest.resetModules();
    appleStoreKit = require("../appleStoreKit.service.js");
    mockGetTransactionInfo.mockResolvedValue({ signedTransactionInfo: undefined });

    await expect(appleStoreKit.getVerifiedTransaction("tx", "coins_pack_100")).rejects.toMatchObject({
      status: 502,
      code: "PURCHASE_LOOKUP_EMPTY",
    });
  });
});
