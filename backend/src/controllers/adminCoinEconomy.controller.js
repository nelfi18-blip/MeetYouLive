"use strict";

/**
 * Admin-only, read-only Coin Economy Control diagnostic endpoint.
 *
 * Exposes adminCoinEconomyControl.service.js over HTTP. Never mutates
 * anything: no coin credits, no balance changes, no payout/withdrawal
 * actions. Strictly for private admin review of which Coins/earnings are
 * backed by verifiable data vs. require reconciliation.
 */

const { getCoinEconomyControl } = require("../services/adminCoinEconomyControl.service.js");

exports.getCoinEconomyControlHandler = async (req, res) => {
  try {
    const result = await getCoinEconomyControl();
    return res.json(result);
  } catch (error) {
    console.error("Admin coin economy control error:", error);
    return res.status(500).json({
      ok: false,
      complete: false,
      message: "Error generando el diagnóstico de economía de Coins",
    });
  }
};
