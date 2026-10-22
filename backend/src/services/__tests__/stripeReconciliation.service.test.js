"use strict";

/**
 * Tests for stripeReconciliation.service.js (read-only reconciliation).
 * Stripe and MongoDB are fully mocked — no network/DB access.
 */

const mockCheckoutSessionsRetrieve = jest.fn();
const mockCheckoutSessionsList = jest.fn();
const mockBalanceTransactionsList = jest.fn();
const mockPayoutsList = jest.fn();

jest.mock("stripe", () =>
  jest.fn(() => ({
    checkout: {
      sessions: {
        retrieve: mockCheckoutSessionsRetrieve,
        list: mockCheckoutSessionsList,
      },
    },
    balanceTransactions: { list: mockBalanceTransactionsList },
    payouts: { list: mockPayoutsList },
  }))
);

jest.mock("../../models/CoinTransaction.js", () => ({
  countDocuments: jest.fn(),
  find: jest.fn(),
}));

const CoinTransaction = require("../../models/CoinTransaction.js");
const {
  reconcileCoinPurchases,
  parseAndValidateOptions,
  ReconciliationValidationError,
  isStripeConfigured,
} = require("../stripeReconciliation.service.js");

/**
 * CoinTransaction.find is called TWICE per reconcileCoinPurchases run:
 *   1. the paginated results page: find(filter).sort().skip().limit().lean()
 *   2. the unpaginated, period-wide session-id lookup used to build the
 *      "known in DB" set for missing_in_db: find(filter, projection).lean()
 * This helper differentiates the two by the presence of a projection arg.
 */
function setupCoinTransactionMocks({ page = [], periodSessionIds } = {}) {
  const pageChain = {
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(page),
  };
  const defaultIds = page
    .filter((tx) => tx?.metadata?.stripeSessionId)
    .map((tx) => ({ metadata: { stripeSessionId: tx.metadata.stripeSessionId } }));
  const idsChain = {
    lean: jest.fn().mockResolvedValue(periodSessionIds !== undefined ? periodSessionIds : defaultIds),
  };

  CoinTransaction.find.mockImplementation((_filter, projection) => {
    if (projection && projection["metadata.stripeSessionId"]) {
      return idsChain;
    }
    return pageChain;
  });

  return { pageChain, idsChain };
}

const START = "2024-01-01T00:00:00.000Z";
const END = "2024-02-01T00:00:00.000Z";

function emptyBalanceTxPage() {
  return { data: [], has_more: false };
}
function emptyPayoutsPage() {
  return { data: [], has_more: false };
}

describe("stripeReconciliation.service", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, STRIPE_SECRET_KEY: "sk_test_123" };
    mockBalanceTransactionsList.mockResolvedValue(emptyBalanceTxPage());
    mockPayoutsList.mockResolvedValue(emptyPayoutsPage());
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe("configuration / validation", () => {
    test("returns explicit not-configured state when STRIPE_SECRET_KEY is missing", async () => {
      delete process.env.STRIPE_SECRET_KEY;
      expect(isStripeConfigured()).toBe(false);

      const result = await reconcileCoinPurchases({ startDate: START, endDate: END });
      expect(result.ok).toBe(false);
      expect(result.stripeConfigured).toBe(false);
      expect(result.complete).toBe(false);
    });

    test("rejects missing dates", () => {
      expect(() => parseAndValidateOptions({})).toThrow(ReconciliationValidationError);
    });

    test("rejects endDate before startDate", () => {
      expect(() => parseAndValidateOptions({ startDate: END, endDate: START })).toThrow(
        ReconciliationValidationError
      );
    });

    test("rejects ranges wider than the max allowed window", () => {
      expect(() =>
        parseAndValidateOptions({ startDate: "2024-01-01T00:00:00.000Z", endDate: "2025-01-01T00:00:00.000Z" })
      ).toThrow(ReconciliationValidationError);
    });

    test("caps pageSize and defaults page", () => {
      const opts = parseAndValidateOptions({ startDate: START, endDate: END, pageSize: 9999, page: -1 });
      expect(opts.pageSize).toBe(100);
      expect(opts.page).toBe(1);
    });
  });

  describe("reconcileCoinPurchases — matching", () => {
    test("categorizes a fully matched purchase with correct gross/fee/net", async () => {
      const coinTx = {
        _id: "64aaa00000000000000000a1",
        userId: "64aaa00000000000000000u1",
        amount: 1000,
        createdAt: new Date("2024-01-05T00:00:00.000Z"),
        metadata: { stripeSessionId: "cs_test_1", amountPaid: 999 },
      };
      CoinTransaction.countDocuments.mockResolvedValue(1);
      setupCoinTransactionMocks({ page: [coinTx] });

      mockCheckoutSessionsRetrieve.mockResolvedValue({
        id: "cs_test_1",
        amount_total: 999,
        currency: "usd",
        metadata: { type: "coins" },
        payment_intent: {
          id: "pi_test_1",
          latest_charge: {
            id: "ch_test_1",
            refunded: false,
            disputed: false,
            amount_refunded: 0,
            balance_transaction: { id: "txn_1", fee: 59, net: 940, currency: "usd" },
          },
        },
      });

      const result = await reconcileCoinPurchases({ startDate: START, endDate: END });

      expect(result.ok).toBe(true);
      expect(result.complete).toBe(true);
      expect(result.results.matched).toHaveLength(1);
      expect(result.results.matched[0]).toMatchObject({
        grossCents: 999,
        feeCents: 59,
        netCents: 940,
        currency: "usd",
        coinTransactionId: "64aaa00000000000000000a1",
      });
      expect(result.summary.byCurrency.usd).toMatchObject({
        grossMinorUnits: 999,
        feeMinorUnits: 59,
        netMinorUnits: 940,
        purchaseCount: 1,
      });
    });

    test("flags amount_mismatch when Stripe gross differs from stored metadata.amountPaid", async () => {
      const coinTx = {
        _id: "64aaa00000000000000000a2",
        userId: "64aaa00000000000000000u2",
        amount: 500,
        createdAt: new Date("2024-01-06T00:00:00.000Z"),
        metadata: { stripeSessionId: "cs_test_2", amountPaid: 499 },
      };
      CoinTransaction.countDocuments.mockResolvedValue(1);
      setupCoinTransactionMocks({ page: [coinTx] });

      mockCheckoutSessionsRetrieve.mockResolvedValue({
        id: "cs_test_2",
        amount_total: 599, // Stripe disagrees with stored metadata
        currency: "usd",
        metadata: { type: "coins" },
        payment_intent: {
          id: "pi_test_2",
          latest_charge: {
            id: "ch_test_2",
            refunded: false,
            disputed: false,
            amount_refunded: 0,
            balance_transaction: { id: "txn_2", fee: 30, net: 569, currency: "usd" },
          },
        },
      });

      const result = await reconcileCoinPurchases({ startDate: START, endDate: END });
      expect(result.results.amount_mismatch).toHaveLength(1);
      expect(result.results.amount_mismatch[0]).toMatchObject({ grossCents: 599, amountPaidCents: 499 });
      expect(result.results.matched).toHaveLength(0);
    });

    test("flags missing_in_stripe when the Checkout Session no longer exists", async () => {
      const coinTx = {
        _id: "64aaa00000000000000000a3",
        userId: "64aaa00000000000000000u3",
        amount: 200,
        createdAt: new Date("2024-01-07T00:00:00.000Z"),
        metadata: { stripeSessionId: "cs_test_missing", amountPaid: 199 },
      };
      CoinTransaction.countDocuments.mockResolvedValue(1);
      setupCoinTransactionMocks({ page: [coinTx] });

      const notFoundError = new Error("No such checkout session");
      notFoundError.code = "resource_missing";
      mockCheckoutSessionsRetrieve.mockRejectedValue(notFoundError);

      const result = await reconcileCoinPurchases({ startDate: START, endDate: END });
      expect(result.results.missing_in_stripe).toHaveLength(1);
      expect(result.results.missing_in_stripe[0].reason).toBe("checkout_session_not_found");
    });

    test("flags refunded_or_disputed and excludes it from matched/amount_mismatch", async () => {
      const coinTx = {
        _id: "64aaa00000000000000000a4",
        userId: "64aaa00000000000000000u4",
        amount: 2000,
        createdAt: new Date("2024-01-08T00:00:00.000Z"),
        metadata: { stripeSessionId: "cs_test_refund", amountPaid: 1999 },
      };
      CoinTransaction.countDocuments.mockResolvedValue(1);
      setupCoinTransactionMocks({ page: [coinTx] });

      mockCheckoutSessionsRetrieve.mockResolvedValue({
        id: "cs_test_refund",
        amount_total: 1999,
        currency: "usd",
        metadata: { type: "coins" },
        payment_intent: {
          id: "pi_test_refund",
          latest_charge: {
            id: "ch_test_refund",
            refunded: true,
            disputed: false,
            amount_refunded: 1999,
            balance_transaction: { id: "txn_refund", fee: 88, net: 1911, currency: "usd" },
          },
        },
      });

      const result = await reconcileCoinPurchases({ startDate: START, endDate: END });
      expect(result.results.refunded_or_disputed).toHaveLength(1);
      expect(result.results.refunded_or_disputed[0]).toMatchObject({ reason: "refunded", amountRefundedCents: 1999 });
      expect(result.results.matched).toHaveLength(0);
      expect(result.results.amount_mismatch).toHaveLength(0);
    });

    test("flags unresolved when metadata is incomplete (never guesses amounts)", async () => {
      const coinTx = {
        _id: "64aaa00000000000000000a5",
        userId: "64aaa00000000000000000u5",
        amount: 300,
        createdAt: new Date("2024-01-09T00:00:00.000Z"),
        metadata: {}, // historical record with no stripeSessionId/amountPaid
      };
      CoinTransaction.countDocuments.mockResolvedValue(1);
      setupCoinTransactionMocks({ page: [coinTx] });

      const result = await reconcileCoinPurchases({ startDate: START, endDate: END });
      expect(result.results.unresolved).toHaveLength(1);
      expect(result.results.unresolved[0].reason).toBe("missing_identifiers");
      expect(mockCheckoutSessionsRetrieve).not.toHaveBeenCalled();
    });

    test("groups multiple currencies separately without summing them together", async () => {
      const usdTx = {
        _id: "64aaa00000000000000000a6",
        userId: "64aaa00000000000000000u6",
        amount: 100,
        createdAt: new Date("2024-01-10T00:00:00.000Z"),
        metadata: { stripeSessionId: "cs_usd", amountPaid: 100 },
      };
      const eurTx = {
        _id: "64aaa00000000000000000a7",
        userId: "64aaa00000000000000000u7",
        amount: 100,
        createdAt: new Date("2024-01-10T00:00:00.000Z"),
        metadata: { stripeSessionId: "cs_eur", amountPaid: 90 },
      };
      CoinTransaction.countDocuments.mockResolvedValue(2);
      setupCoinTransactionMocks({ page: [usdTx, eurTx] });

      mockCheckoutSessionsRetrieve.mockImplementation(async (id) => {
        if (id === "cs_usd") {
          return {
            id,
            amount_total: 100,
            currency: "usd",
            metadata: { type: "coins" },
            payment_intent: {
              id: "pi_usd",
              latest_charge: {
                id: "ch_usd",
                refunded: false,
                disputed: false,
                balance_transaction: { id: "txn_usd", fee: 5, net: 95, currency: "usd" },
              },
            },
          };
        }
        return {
          id,
          amount_total: 90,
          currency: "eur",
          metadata: { type: "coins" },
          payment_intent: {
            id: "pi_eur",
            latest_charge: {
              id: "ch_eur",
              refunded: false,
              disputed: false,
              balance_transaction: { id: "txn_eur", fee: 4, net: 86, currency: "eur" },
            },
          },
        };
      });

      const result = await reconcileCoinPurchases({ startDate: START, endDate: END });
      expect(result.results.matched).toHaveLength(2);
      expect(result.summary.byCurrency.usd).toMatchObject({ grossMinorUnits: 100, purchaseCount: 1 });
      expect(result.summary.byCurrency.eur).toMatchObject({ grossMinorUnits: 90, purchaseCount: 1 });
    });

    test("deduplicates by matching exactly once per session (no double counting)", async () => {
      const coinTx = {
        _id: "64aaa00000000000000000a8",
        userId: "64aaa00000000000000000u8",
        amount: 100,
        createdAt: new Date("2024-01-11T00:00:00.000Z"),
        metadata: { stripeSessionId: "cs_dup", amountPaid: 100 },
      };
      CoinTransaction.countDocuments.mockResolvedValue(1);
      setupCoinTransactionMocks({ page: [coinTx] });
      mockCheckoutSessionsRetrieve.mockResolvedValue({
        id: "cs_dup",
        amount_total: 100,
        currency: "usd",
        metadata: { type: "coins" },
        payment_intent: {
          id: "pi_dup",
          latest_charge: {
            id: "ch_dup",
            refunded: false,
            disputed: false,
            balance_transaction: { id: "txn_dup", fee: 5, net: 95, currency: "usd" },
          },
        },
      });

      const result = await reconcileCoinPurchases({ startDate: START, endDate: END });
      expect(mockCheckoutSessionsRetrieve).toHaveBeenCalledTimes(1);
      expect(result.results.matched).toHaveLength(1);
    });

    test("respects pagination (page/pageSize) against the results-page CoinTransaction.find query", async () => {
      CoinTransaction.countDocuments.mockResolvedValue(50);
      const { pageChain } = setupCoinTransactionMocks({ page: [] });

      await reconcileCoinPurchases({ startDate: START, endDate: END, page: 2, pageSize: 10 });

      expect(pageChain.skip).toHaveBeenCalledWith(10);
      expect(pageChain.limit).toHaveBeenCalledWith(10);
    });
  });

  describe("fix #1 — false missing_in_db from page-only comparison", () => {
    test("does NOT flag a purchase on a different results page as missing_in_db", async () => {
      // Two coin purchases exist in the full period, but pageSize=1 means
      // only ONE of them is fetched for the current results page. The
      // Stripe-side scan must still know about BOTH (via the period-wide,
      // unpaginated session-id query) so the one not on this page is never
      // misreported as missing_in_db.
      const pageTx = {
        _id: "64aaa00000000000000000b1",
        userId: "64aaa00000000000000000u1",
        amount: 100,
        createdAt: new Date("2024-01-02T00:00:00.000Z"),
        metadata: { stripeSessionId: "cs_on_page", amountPaid: 100 },
      };
      const offPageSessionId = "cs_off_page"; // belongs to a purchase NOT on this page

      CoinTransaction.countDocuments.mockResolvedValue(2);
      setupCoinTransactionMocks({
        page: [pageTx],
        periodSessionIds: [
          { metadata: { stripeSessionId: "cs_on_page" } },
          { metadata: { stripeSessionId: offPageSessionId } },
        ],
      });

      mockCheckoutSessionsRetrieve.mockResolvedValue({
        id: "cs_on_page",
        amount_total: 100,
        currency: "usd",
        metadata: { type: "coins" },
        payment_intent: {
          id: "pi_on_page",
          latest_charge: {
            id: "ch_on_page",
            refunded: false,
            disputed: false,
            balance_transaction: { id: "txn_on_page", fee: 5, net: 95, currency: "usd" },
          },
        },
      });

      // Stripe reports a charge for the OFF-PAGE purchase during the scan.
      mockBalanceTransactionsList.mockResolvedValueOnce({
        data: [
          {
            id: "txn_off_page",
            amount: 150,
            fee: 7,
            net: 143,
            currency: "usd",
            created: Math.floor(new Date("2024-01-03T00:00:00.000Z").getTime() / 1000),
            source: { id: "ch_off_page", payment_intent: "pi_off_page" },
          },
        ],
        has_more: false,
      });
      mockCheckoutSessionsList.mockResolvedValue({
        data: [{ id: offPageSessionId, metadata: { type: "coins" } }],
      });

      const result = await reconcileCoinPurchases({ startDate: START, endDate: END, page: 1, pageSize: 1 });

      expect(result.results.missing_in_db).toHaveLength(0);
      // Still correctly reports that more pages exist for this range.
      expect(result.pagination.hasMore).toBe(true);
      expect(result.complete).toBe(false); // hasMore alone is enough to be incomplete
    });

    test("DOES flag a Stripe charge as missing_in_db when truly absent from the whole period", async () => {
      CoinTransaction.countDocuments.mockResolvedValue(0);
      setupCoinTransactionMocks({ page: [], periodSessionIds: [] });

      mockBalanceTransactionsList.mockResolvedValueOnce({
        data: [
          {
            id: "txn_orphan",
            amount: 499,
            fee: 25,
            net: 474,
            currency: "usd",
            created: Math.floor(new Date("2024-01-12T00:00:00.000Z").getTime() / 1000),
            source: { id: "ch_orphan", payment_intent: "pi_orphan" },
          },
        ],
        has_more: false,
      });
      mockCheckoutSessionsList.mockResolvedValue({ data: [{ id: "cs_orphan", metadata: { type: "coins" } }] });

      const result = await reconcileCoinPurchases({ startDate: START, endDate: END });
      expect(result.results.missing_in_db).toHaveLength(1);
      expect(result.results.missing_in_db[0]).toMatchObject({
        stripeSessionId: "cs_orphan",
        grossCents: 499,
        currency: "usd",
      });
    });
  });

  describe("fix #2 — incomplete historicals included and classified as unresolved", () => {
    test("includes a CoinTransaction without metadata.stripeSessionId in the query and marks it unresolved", async () => {
      const legacyTx = {
        _id: "64aaa00000000000000000c1",
        userId: "64aaa00000000000000000u1",
        amount: 400,
        createdAt: new Date("2024-01-04T00:00:00.000Z"),
        metadata: {}, // pre-dates metadata.stripeSessionId tracking
      };
      CoinTransaction.countDocuments.mockResolvedValue(1);
      setupCoinTransactionMocks({ page: [legacyTx] });

      const result = await reconcileCoinPurchases({ startDate: START, endDate: END });

      // Never excluded from the query — it is present and classified.
      expect(result.pagination.totalCandidates).toBe(1);
      expect(result.results.unresolved).toHaveLength(1);
      expect(result.results.unresolved[0]).toMatchObject({
        reason: "missing_identifiers",
        coinTransactionId: "64aaa00000000000000000c1",
      });

      // The main query filter must not require metadata.stripeSessionId to exist.
      const [[mainFilter]] = CoinTransaction.find.mock.calls.filter(
        (call) => !(call[1] && call[1]["metadata.stripeSessionId"])
      );
      expect(mainFilter["metadata.stripeSessionId"]).toBeUndefined();
    });
  });

  describe("fix #3 — product classification (never treat Sparks/video as Coins)", () => {
    test("marks a CoinTransaction unresolved when its stored session is actually a Sparks purchase", async () => {
      const coinTx = {
        _id: "64aaa00000000000000000d1",
        userId: "64aaa00000000000000000u1",
        amount: 100,
        createdAt: new Date("2024-01-05T00:00:00.000Z"),
        metadata: { stripeSessionId: "cs_wrong_product", amountPaid: 100 },
      };
      CoinTransaction.countDocuments.mockResolvedValue(1);
      setupCoinTransactionMocks({ page: [coinTx] });

      mockCheckoutSessionsRetrieve.mockResolvedValue({
        id: "cs_wrong_product",
        amount_total: 100,
        currency: "usd",
        metadata: { type: "sparks" }, // NOT coins
        payment_intent: {
          id: "pi_wrong_product",
          latest_charge: {
            id: "ch_wrong_product",
            refunded: false,
            disputed: false,
            balance_transaction: { id: "txn_wrong_product", fee: 5, net: 95, currency: "usd" },
          },
        },
      });

      const result = await reconcileCoinPurchases({ startDate: START, endDate: END });
      expect(result.results.matched).toHaveLength(0);
      expect(result.results.unresolved).toHaveLength(1);
      expect(result.results.unresolved[0]).toMatchObject({
        reason: "stripe_session_product_mismatch",
        stripeSessionProductType: "sparks",
      });
    });

    test("excludes a Stripe charge whose Checkout Session is a video purchase from missing_in_db", async () => {
      CoinTransaction.countDocuments.mockResolvedValue(0);
      setupCoinTransactionMocks({ page: [], periodSessionIds: [] });

      mockBalanceTransactionsList.mockResolvedValueOnce({
        data: [
          {
            id: "txn_video",
            amount: 499,
            fee: 25,
            net: 474,
            currency: "usd",
            created: Math.floor(Date.now() / 1000),
            source: { id: "ch_video", payment_intent: "pi_video" },
          },
        ],
        has_more: false,
      });
      mockCheckoutSessionsList.mockResolvedValue({ data: [{ id: "cs_video", metadata: { type: "video" } }] });

      const result = await reconcileCoinPurchases({ startDate: START, endDate: END });
      expect(result.results.missing_in_db).toHaveLength(0);
      expect(result.results.unresolved).toHaveLength(0);
    });

    test("surfaces a Checkout Session with no product-type metadata as unresolved, not missing_in_db", async () => {
      CoinTransaction.countDocuments.mockResolvedValue(0);
      setupCoinTransactionMocks({ page: [], periodSessionIds: [] });

      mockBalanceTransactionsList.mockResolvedValueOnce({
        data: [
          {
            id: "txn_ambiguous",
            amount: 250,
            fee: 12,
            net: 238,
            currency: "usd",
            created: Math.floor(Date.now() / 1000),
            source: { id: "ch_ambiguous", payment_intent: "pi_ambiguous" },
          },
        ],
        has_more: false,
      });
      mockCheckoutSessionsList.mockResolvedValue({ data: [{ id: "cs_ambiguous", metadata: {} }] });

      const result = await reconcileCoinPurchases({ startDate: START, endDate: END });
      expect(result.results.missing_in_db).toHaveLength(0);
      expect(result.results.unresolved).toHaveLength(1);
      expect(result.results.unresolved[0]).toMatchObject({
        reason: "stripe_session_missing_product_type",
        stripeSessionId: "cs_ambiguous",
      });
      expect(result.complete).toBe(false);
    });

    test("excludes charges with no resolvable Checkout Session at all (not a coin purchase)", async () => {
      CoinTransaction.countDocuments.mockResolvedValue(0);
      setupCoinTransactionMocks({ page: [], periodSessionIds: [] });

      mockBalanceTransactionsList.mockResolvedValueOnce({
        data: [
          {
            id: "txn_unrelated",
            amount: 999,
            fee: 50,
            net: 949,
            currency: "usd",
            created: Math.floor(Date.now() / 1000),
            source: { id: "ch_unrelated", payment_intent: "pi_unrelated" },
          },
        ],
        has_more: false,
      });
      mockCheckoutSessionsList.mockResolvedValue({ data: [] }); // no checkout session found

      const result = await reconcileCoinPurchases({ startDate: START, endDate: END });
      expect(result.results.missing_in_db).toHaveLength(0);
      expect(result.results.unresolved).toHaveLength(0);
    });
  });

  describe("fix #4 — 'complete' never presents partial/unresolved/truncated as finished", () => {
    test("complete is false when there are more CoinTransaction pages pending", async () => {
      CoinTransaction.countDocuments.mockResolvedValue(2);
      setupCoinTransactionMocks({ page: [], periodSessionIds: [] });

      const result = await reconcileCoinPurchases({ startDate: START, endDate: END, page: 1, pageSize: 1 });
      expect(result.pagination.hasMore).toBe(true);
      expect(result.complete).toBe(false);
      expect(result.warnings.some((w) => /más CoinTransaction/.test(w))).toBe(true);
    });

    test("complete is false when there is at least one unresolved record, even with zero errors", async () => {
      const legacyTx = {
        _id: "64aaa00000000000000000e1",
        userId: "64aaa00000000000000000u1",
        amount: 50,
        createdAt: new Date("2024-01-02T00:00:00.000Z"),
        metadata: {},
      };
      CoinTransaction.countDocuments.mockResolvedValue(1);
      setupCoinTransactionMocks({ page: [legacyTx] });

      const result = await reconcileCoinPurchases({ startDate: START, endDate: END });
      expect(result.errors).toHaveLength(0);
      expect(result.results.unresolved.length).toBeGreaterThan(0);
      expect(result.complete).toBe(false);
      expect(result.warnings.some((w) => /unresolved/.test(w))).toBe(true);
    });

    test("complete is false when the Stripe bank payouts summary itself fails", async () => {
      CoinTransaction.countDocuments.mockResolvedValue(0);
      setupCoinTransactionMocks({ page: [], periodSessionIds: [] });
      mockPayoutsList.mockRejectedValue(new Error("stripe payouts unavailable"));

      const result = await reconcileCoinPurchases({ startDate: START, endDate: END });
      expect(result.stripeBankPayouts.ok).toBe(false);
      expect(result.complete).toBe(false);
    });

    test("marks the scan truncated when more pages exist beyond maxBalanceTransactionPages", async () => {
      CoinTransaction.countDocuments.mockResolvedValue(0);
      setupCoinTransactionMocks({ page: [], periodSessionIds: [] });

      mockBalanceTransactionsList.mockResolvedValue({
        data: [
          {
            id: "txn_page",
            amount: 100,
            fee: 5,
            net: 95,
            currency: "usd",
            created: Math.floor(Date.now() / 1000),
            source: { id: "ch_page", payment_intent: "pi_page" },
          },
        ],
        has_more: true, // always more, forcing truncation at maxPages
      });
      mockCheckoutSessionsList.mockResolvedValue({ data: [{ id: "cs_page", metadata: { type: "coins" } }] });

      const result = await reconcileCoinPurchases({
        startDate: START,
        endDate: END,
        maxBalanceTransactionPages: 1,
      });

      expect(result.stripeScan.truncated).toBe(true);
      expect(result.complete).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    test("complete is true only when the whole range is fully resolved with no pending pages/unresolved/errors", async () => {
      const coinTx = {
        _id: "64aaa00000000000000000f1",
        userId: "64aaa00000000000000000u1",
        amount: 100,
        createdAt: new Date("2024-01-05T00:00:00.000Z"),
        metadata: { stripeSessionId: "cs_complete", amountPaid: 100 },
      };
      CoinTransaction.countDocuments.mockResolvedValue(1);
      setupCoinTransactionMocks({ page: [coinTx] });

      mockCheckoutSessionsRetrieve.mockResolvedValue({
        id: "cs_complete",
        amount_total: 100,
        currency: "usd",
        metadata: { type: "coins" },
        payment_intent: {
          id: "pi_complete",
          latest_charge: {
            id: "ch_complete",
            refunded: false,
            disputed: false,
            balance_transaction: { id: "txn_complete", fee: 5, net: 95, currency: "usd" },
          },
        },
      });

      const result = await reconcileCoinPurchases({ startDate: START, endDate: END });
      expect(result.complete).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe("partial failures", () => {
    test("surfaces stripe errors without pretending the result is complete", async () => {
      const coinTx = {
        _id: "64aaa00000000000000000a9",
        userId: "64aaa00000000000000000u9",
        amount: 100,
        createdAt: new Date("2024-01-13T00:00:00.000Z"),
        metadata: { stripeSessionId: "cs_rate_limited", amountPaid: 100 },
      };
      CoinTransaction.countDocuments.mockResolvedValue(1);
      setupCoinTransactionMocks({ page: [coinTx] });

      const rateLimitError = new Error("Too many requests");
      rateLimitError.type = "StripeRateLimitError";
      mockCheckoutSessionsRetrieve.mockRejectedValue(rateLimitError);

      const result = await reconcileCoinPurchases({ startDate: START, endDate: END });
      expect(result.results.unresolved).toHaveLength(1);
      expect(result.results.unresolved[0].stripeErrorType).toBe("StripeRateLimitError");
      expect(result.complete).toBe(false);
    });

    test("balanceTransactions.list failure is reported in errors and truncates the scan", async () => {
      CoinTransaction.countDocuments.mockResolvedValue(0);
      setupCoinTransactionMocks({ page: [], periodSessionIds: [] });
      mockBalanceTransactionsList.mockRejectedValue(new Error("network timeout"));

      const result = await reconcileCoinPurchases({ startDate: START, endDate: END });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.complete).toBe(false);
    });
  });
});
