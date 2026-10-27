const mongoose = require("mongoose");
const User = require("../models/User.js");
const CoinTransaction = require("../models/CoinTransaction.js");
const { COIN_PACKAGES } = require("./coins.controller.js");
const { MAX_USER_COINS_BALANCE, creditCoinsWithCap } = require("../services/coins.service.js");
const googlePlayBilling = require("../services/googlePlayBilling.service.js");
const { trackSafeAnalyticsEvent } = require("../services/analytics.service.js");

const trackMilestoneEvent = typeof trackSafeAnalyticsEvent === "function" ? trackSafeAnalyticsEvent : () => {};

const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 80;

// productId -> canonical package, built from the same COIN_PACKAGES list used
// by the Stripe flow so the three existing packages (100/250/700) are the
// only ones ever creditable through this endpoint.
const PRODUCT_ID_TO_PACKAGE = COIN_PACKAGES.reduce((acc, pkg) => {
  if (pkg.googlePlayProductId) acc[pkg.googlePlayProductId] = pkg;
  return acc;
}, {});

function createHttpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/** Returns true when an error is a MongoDB write-conflict and should be retried. */
function isWriteConflictError(err) {
  if (!err) return false;
  if (err.code === 112) return true;
  if (typeof err.message === "string" && err.message.includes("Write conflict")) return true;
  if (typeof err.hasErrorLabel === "function" && err.hasErrorLabel("TransientTransactionError")) return true;
  if (typeof err.hasErrorLabel === "function" && err.hasErrorLabel("UnknownTransactionCommitResult")) return true;
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Validates and credits a Google Play Billing one-time ("managed") product
 * purchase for Coins.
 *
 * Security model:
 *  - The client only ever sends `productId` + `purchaseToken` (opaque,
 *    Google-issued). No coin amount or price is ever accepted from the
 *    client — the credited amount always comes from the server's own
 *    COIN_PACKAGES lookup for the validated productId.
 *  - `purchaseToken` is independently verified against the Google Play
 *    Developer API (Android Publisher) — the only source of truth for
 *    purchaseState/consumptionState. A request is never trusted on its own.
 *  - `obfuscatedExternalAccountId` (set by the client via
 *    setObfuscatedAccountId(session.user.id) before launching the purchase)
 *    must match the authenticated user, so a token obtained under one
 *    account can never be redeemed by a different authenticated session.
 *  - Crediting is idempotent: CoinTransaction has a unique index on
 *    `metadata.purchaseToken`, and the credit + transaction write happen in
 *    one Mongo transaction, so retries/duplicate submissions/concurrent
 *    requests for the same token can never credit coins twice.
 *  - The purchase is only consumed on Google's side (finalizing it and
 *    allowing a repurchase) AFTER coins have been durably credited.
 */
const verifyCoinsPurchase = async (req, res) => {
  const { productId, purchaseToken } = req.body;

  const coinPackage = PRODUCT_ID_TO_PACKAGE[productId];
  if (!coinPackage) {
    return res.status(400).json({ message: "Producto de Google Play no reconocido" });
  }

  if (!googlePlayBilling.isConfigured()) {
    console.error("[google-play] verifyCoinsPurchase called but Google Play Billing is not configured");
    return res.status(503).json({ message: "La validación de compras de Google Play no está configurada" });
  }

  let purchase;
  try {
    purchase = await googlePlayBilling.getProductPurchase(productId, purchaseToken);
  } catch (err) {
    console.error("[google-play] purchase lookup failed", {
      productId,
      status: err.status,
      message: err.message,
    });
    return res.status(err.status === 404 ? 404 : 502).json({
      message: "No se pudo verificar la compra con Google Play",
    });
  }

  // purchaseState: 0 = purchased, 1 = canceled, 2 = pending. Only a
  // completed ("purchased") state may ever credit coins.
  if (purchase.purchaseState !== 0) {
    return res.status(409).json({
      message: "La compra todavía no está confirmada por Google Play",
      code: "PURCHASE_NOT_COMPLETE",
      purchaseState: purchase.purchaseState,
    });
  }

  // Binds the purchase to the authenticated user. The client sets this via
  // setObfuscatedAccountId(session.user.id) before launching the billing
  // flow (see GooglePlayBillingPlugin.java / lib/googlePlayBilling.js).
  if (
    purchase.obfuscatedExternalAccountId &&
    purchase.obfuscatedExternalAccountId !== String(req.userId)
  ) {
    console.error("[google-play] purchase token does not belong to the authenticated user", {
      productId,
      userId: req.userId,
    });
    return res.status(403).json({ message: "Esta compra no corresponde a tu cuenta" });
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const dbSession = await mongoose.startSession();
    try {
      let responsePayload = null;

      await dbSession.withTransaction(async () => {
        let tx = await CoinTransaction.findOne({ "metadata.purchaseToken": purchaseToken }).session(dbSession);

        if (tx && tx.status === "completed") {
          // Already credited by a prior request (retry, duplicate delivery,
          // or restored pending purchase) — never credit twice.
          responsePayload = {
            coinsCredited: tx.amount,
            newBalance: null,
            alreadyProcessed: true,
          };
          return;
        }

        const user = await User.findById(req.userId).select("coins").session(dbSession);
        if (!user) throw createHttpError(404, "Usuario no encontrado");

        if (!tx) {
          const [createdTx] = await CoinTransaction.create(
            [
              {
                userId: user._id,
                type: "purchase",
                amount: coinPackage.coins,
                reason: `Compra de ${coinPackage.coins} MYL Coins via Google Play`,
                status: "pending",
                metadata: {
                  purchaseToken,
                  productId,
                  packageId: String(coinPackage.id),
                  packageCoins: coinPackage.coins,
                  platform: "google_play",
                  coinsCredited: false,
                },
              },
            ],
            { session: dbSession }
          );
          tx = createdTx;
        }

        const creditResult = await creditCoinsWithCap(user._id, coinPackage.coins, { session: dbSession });
        if (!creditResult.userFound) {
          tx.status = "failed";
          await tx.save({ session: dbSession });
          throw createHttpError(500, "No se pudo acreditar el saldo de Coins");
        }

        if (creditResult.capped) {
          console.error("[google-play] MAX_USER_COINS_BALANCE reached — coins withheld from a PAID purchase, needs manual review", {
            productId,
            userId: String(user._id),
            requestedCoins: creditResult.requested,
            creditedCoins: creditResult.credited,
            maxCoinsBalance: MAX_USER_COINS_BALANCE,
          });
        }

        tx.status = "completed";
        tx.amount = creditResult.credited;
        tx.metadata = {
          ...(tx.metadata || {}),
          coinsCredited: creditResult.credited > 0,
          coinsRequested: creditResult.requested,
          coinsWithheldByCap: creditResult.requested - creditResult.credited,
          maxCoinsBalance: MAX_USER_COINS_BALANCE,
        };
        await tx.save({ session: dbSession });

        responsePayload = {
          coinsCredited: creditResult.credited,
          newBalance: creditResult.newCoins,
          cappedByLimit: creditResult.capped,
          alreadyProcessed: false,
        };
      });

      if (!responsePayload) {
        throw createHttpError(500, "No se pudo procesar la compra");
      }

      // Consume on Google's side so the purchase is finalized and the user
      // can buy the same consumable pack again. Best-effort: coins are
      // already durably credited at this point (above, inside the
      // transaction), so a consume failure here must never be surfaced as a
      // user-facing error. It is logged for follow-up; the client's startup
      // pending-purchase recovery (queryPurchases) will resubmit the same
      // token, which safely no-ops the credit (idempotent) and retries
      // the consume call.
      try {
        await googlePlayBilling.consumeProductPurchase(productId, purchaseToken);
      } catch (consumeErr) {
        console.error("[google-play] consume failed (coins already credited, safe to retry later)", {
          productId,
          message: consumeErr.message,
        });
      }

      if (!responsePayload.alreadyProcessed) {
        trackMilestoneEvent("coins_purchase_completed", String(req.userId), {
          packageId: String(coinPackage.id),
          coins: responsePayload.coinsCredited,
          platform: "google_play",
        });
      }

      return res.json(responsePayload);
    } catch (err) {
      if (isWriteConflictError(err) && attempt < MAX_RETRIES) {
        await sleep(RETRY_BACKOFF_MS * Math.pow(2, attempt - 1));
        continue;
      }
      if (err && err.code === 11000) {
        // Another concurrent request is already processing this exact
        // purchaseToken (unique index race). Safe for the client to retry;
        // it will resolve to the already-completed transaction.
        return res.status(409).json({ message: "Esta compra ya se está procesando", code: "PURCHASE_IN_PROGRESS" });
      }
      const status = Number.isInteger(err?.status) ? err.status : 500;
      console.error("[google-play] verifyCoinsPurchase failed", { message: err?.message, status });
      return res.status(status).json({ message: err?.message || "Error interno del servidor" });
    } finally {
      await dbSession.endSession();
    }
  }
};

module.exports = { verifyCoinsPurchase, PRODUCT_ID_TO_PACKAGE };
