"use strict";

/**
 * Admin-only, read-only Stripe ↔ Coins reconciliation endpoint.
 *
 * Exposes stripeReconciliation.service.js over HTTP. Never mutates
 * anything: no coin credits, no balance changes, no payout actions, no
 * webhook/Checkout interaction. Strictly for admin review of financial
 * movements vs. the existing CoinTransaction ledger.
 */

const {
  reconcileCoinPurchases,
  ReconciliationValidationError,
} = require("../services/stripeReconciliation.service.js");

exports.getCoinReconciliation = async (req, res) => {
  try {
    const { startDate, endDate, page, pageSize, maxBalanceTransactionPages } = req.query;

    const result = await reconcileCoinPurchases({
      startDate,
      endDate,
      page,
      pageSize,
      maxBalanceTransactionPages,
    });

    if (!result.ok) {
      // Stripe not configured, or validation already happened below —
      // explicit, honest failure state, never fabricated numbers.
      return res.status(503).json(result);
    }

    return res.json(result);
  } catch (error) {
    if (error instanceof ReconciliationValidationError) {
      return res.status(400).json({ ok: false, complete: false, reconciled: false, message: error.message });
    }
    console.error("Admin coin reconciliation error:", error);
    return res.status(500).json({
      ok: false,
      complete: false,
      reconciled: false,
      message: "Error ejecutando la conciliación de Stripe/Coins",
    });
  }
};
