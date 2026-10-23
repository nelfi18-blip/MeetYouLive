"use strict";

/**
 * Admin-only, read-only monthly financial report endpoint.
 *
 * Exposes adminMonthlyFinancialReport.service.js over HTTP. Never mutates
 * anything: no coin credits, no balance changes, no payout/withdrawal
 * actions, no webhook/Checkout interaction. Strictly for private admin
 * review of MeetYouLive Technologies LLC's monthly financial movements.
 */

const {
  getMonthlyFinancialReport,
  FinancialReportValidationError,
} = require("../services/adminMonthlyFinancialReport.service.js");

exports.getMonthlyFinancialReportHandler = async (req, res) => {
  try {
    const { year, month, page, coinsPageSize, maxBalanceTransactionPages } = req.query;

    const result = await getMonthlyFinancialReport({
      year,
      month,
      page,
      coinsPageSize,
      maxBalanceTransactionPages,
    });

    if (!result.ok) {
      // Honest failure state (e.g. Stripe not configured) — never
      // fabricated numbers.
      return res.status(503).json(result);
    }

    return res.json(result);
  } catch (error) {
    if (error instanceof FinancialReportValidationError) {
      return res.status(400).json({ ok: false, complete: false, message: error.message });
    }
    console.error("Admin monthly financial report error:", error);
    return res.status(500).json({
      ok: false,
      complete: false,
      message: "Error generando el reporte financiero mensual",
    });
  }
};
