"use strict";

/**
 * Google Play Coins summary (read-only, MongoDB-only).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PURPOSE
 * ─────────────────────────────────────────────────────────────────────────
 * This is a small, INDEPENDENT companion to stripeReconciliation.service.js.
 * Stripe's reconciler only ever covers Stripe Checkout purchases; Coins
 * purchased via Google Play Billing (`metadata.platform === "google_play"`,
 * credited by googlePlayPurchase.controller.js) are explicitly excluded
 * from it, because they have no Stripe Checkout Session / charge to
 * resolve against (see stripeReconciliation.service.js limitation #1).
 *
 * This service NEVER writes to MongoDB or to Google Play, never credits or
 * debits coins, and never calls the Google Play Developer API / Play
 * Console. It only reads already-credited `CoinTransaction` documents.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CRITICAL LIMITATION — THIS IS NOT REVENUE
 * ─────────────────────────────────────────────────────────────────────────
 * A `CoinTransaction` record only proves that the backend credited Coins to
 * a user after Google Play told it a purchase was valid
 * (`googlePlayBilling.getProductPurchase`). It does NOT prove, and this
 * service NEVER computes or infers:
 *   - how much money the end user actually paid (local currency, taxes,
 *     regional pricing);
 *   - Google's service fee / commission on the sale;
 *   - the net amount Google actually settles/pays out to the company; or
 *   - whether the purchase was a real paying customer vs. a Google Play
 *     test/license-tester transaction (Google Play test purchases ARE
 *     processed and credited by the exact same code path and are
 *     indistinguishable from real ones in this collection).
 * Every field this service returns is therefore a COUNT of Coins/
 * transactions recorded in MongoDB — never a dollar amount, never a tax
 * figure, never a "net" or "settled" figure, and never presented as fiscal
 * income. Callers (the monthly financial report, the admin UI) must keep
 * this summary visually and semantically separate from any Stripe
 * charge/fee/net figures — they are not comparable and must never be
 * summed together.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DATE SEMANTICS
 * ─────────────────────────────────────────────────────────────────────────
 * `startDate`/`endDate` are an inclusive-start, exclusive-end window
 * `[startDate, endDate)` applied to `CoinTransaction.createdAt`, matching
 * the exact convention used by stripeReconciliation.service.js.
 */

const CoinTransaction = require("../models/CoinTransaction.js");

/**
 * Summarizes Google Play-credited Coins purchases in `[startDate, endDate)`.
 * Returns `{ ok: false, available: false, reason, message }` on any query
 * failure — never a silent empty/zero result.
 */
async function summarizeGooglePlayCoinPurchases({ startDate, endDate }) {
  if (!(startDate instanceof Date) || !(endDate instanceof Date) || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return {
      ok: false,
      available: false,
      reason: "invalid_date_range",
      message: "startDate/endDate inválidos para el resumen de Google Play",
    };
  }

  const filter = {
    type: "purchase",
    status: "completed",
    "metadata.platform": "google_play",
    createdAt: { $gte: startDate, $lt: endDate },
  };

  let rows;
  try {
    rows = await CoinTransaction.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { $ifNull: ["$metadata.productId", null] },
          transactionCount: { $sum: 1 },
          totalCoins: { $sum: "$amount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);
  } catch (err) {
    return {
      ok: false,
      available: false,
      reason: "query_error",
      message: err?.message || "Error consultando CoinTransaction para el resumen de Google Play",
    };
  }

  const byProductId = rows.map((row) => ({
    productId: row._id ?? null,
    transactionCount: row.transactionCount,
    totalCoins: row.totalCoins,
  }));

  const totals = byProductId.reduce(
    (acc, row) => ({
      transactionCount: acc.transactionCount + row.transactionCount,
      totalCoins: acc.totalCoins + row.totalCoins,
    }),
    { transactionCount: 0, totalCoins: 0 }
  );

  return {
    ok: true,
    available: true,
    source: "mongodb_cointransaction",
    notGooglePlayConsoleRevenue: true,
    period: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
    totals,
    byProductId,
    note:
      "Resumen de solo lectura de CoinTransaction (type=purchase, status=completed, metadata.platform=google_play) " +
      "entre [startDate, endDate). NO representa ingresos, impuestos, comisiones de Google ni importes netos: solo " +
      "cuenta transacciones y Coins ya acreditados en MongoDB. No se cruza ni se suma con cifras de Stripe. Puede " +
      "incluir compras de prueba de Google Play (license testers), indistinguibles de compras reales en esta colección.",
  };
}

module.exports = {
  summarizeGooglePlayCoinPurchases,
};
