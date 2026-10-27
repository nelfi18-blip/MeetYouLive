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

  // Binds the purchase to the authenticated user. The client always sets
  // this via setObfuscatedAccountId(session.user.id) before launching the
  // billing flow (see GooglePlayBillingPlugin.java / lib/googlePlayBilling.js)
  // — the exact same string NextAuth stores as session.user.id and the
  // backend reads back as req.userId (both are the Mongo ObjectId's
  // lowercase hex .toString(), no additional transformation on either side).
  //
  // This check is MANDATORY, not best-effort: a purchaseToken without this
  // field attested by Google is NEVER treated as proof of ownership by
  // itself — doing so would let any authenticated user claim a token they
  // did not purchase (e.g. one obtained outside our app, or via a tampered
  // client that skipped setObfuscatedAccountId). Fail closed in both the
  // "missing" and "mismatch" cases; never infer ownership from req.userId
  // alone.
  const expectedAccountId = String(req.userId);
  const purchaseAccountId = purchase.obfuscatedExternalAccountId;
  if (!purchaseAccountId || purchaseAccountId !== expectedAccountId) {
    console.error("[google-play] purchase token is missing or does not match the authenticated user's account binding", {
      productId,
      userId: req.userId,
      hasAccountId: Boolean(purchaseAccountId),
    });
    return res.status(403).json({
      message: "Esta compra no corresponde a tu cuenta",
      code: purchaseAccountId ? "PURCHASE_ACCOUNT_MISMATCH" : "PURCHASE_ACCOUNT_UNLINKED",
    });
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const dbSession = await mongoose.startSession();
    try {
      let responsePayload = null;

      await dbSession.withTransaction(async () => {
        let tx = await CoinTransaction.findOne({ "metadata.purchaseToken": purchaseToken }).session(dbSession);

        if (tx && tx.status === "completed") {
          // Fully delivered by a prior request (retry, duplicate delivery,
          // or restored pending purchase) — never credit twice.
          responsePayload = {
            coinsCredited: tx.amount,
            newBalance: null,
            alreadyProcessed: true,
            fullyCredited: true,
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
                amount: 0,
                reason: `Compra de ${coinPackage.coins} MYL Coins via Google Play`,
                status: "pending",
                metadata: {
                  purchaseToken,
                  productId,
                  packageId: String(coinPackage.id),
                  packageCoins: coinPackage.coins,
                  platform: "google_play",
                  coinsRequested: coinPackage.coins,
                  coinsCreditedTotal: 0,
                  coinsCredited: false,
                },
              },
            ],
            { session: dbSession }
          );
          tx = createdTx;
        }

        // Tracks how much of this PAID purchase has actually been
        // delivered so far. A purchase is only ever "completed" (and only
        // ever consumed on Google's side) once the FULL amount has been
        // credited — this is what makes a MAX_USER_COINS_BALANCE cap safe
        // to recover from: nothing is silently written off as delivered,
        // nothing is double-credited on a later retry, and the user keeps
        // the (still-unconsumed) purchase until they have room for the
        // rest of it.
        const coinsRequested = Number(tx.metadata?.coinsRequested) || coinPackage.coins;
        const alreadyCredited = Number(tx.metadata?.coinsCreditedTotal) || 0;
        const remaining = Math.max(0, coinsRequested - alreadyCredited);

        if (remaining <= 0) {
          // Self-heal: everything was already credited on a previous
          // attempt but the transaction was not (yet) marked completed —
          // finish it now without crediting anything further.
          tx.status = "completed";
          tx.amount = alreadyCredited;
          await tx.save({ session: dbSession });
          responsePayload = {
            coinsCredited: alreadyCredited,
            newBalance: null,
            alreadyProcessed: true,
            fullyCredited: true,
          };
          return;
        }

        const creditResult = await creditCoinsWithCap(user._id, remaining, { session: dbSession });
        if (!creditResult.userFound) {
          tx.status = "failed";
          await tx.save({ session: dbSession });
          throw createHttpError(500, "No se pudo acreditar el saldo de Coins");
        }

        const coinsCreditedTotal = alreadyCredited + creditResult.credited;
        const fullyCredited = coinsCreditedTotal >= coinsRequested;

        if (!fullyCredited) {
          console.error("[google-play] MAX_USER_COINS_BALANCE reached — purchase only partially delivered, left pending/unconsumed for later recovery", {
            productId,
            userId: String(user._id),
            coinsRequested,
            coinsCreditedTotal,
            maxCoinsBalance: MAX_USER_COINS_BALANCE,
          });
        }

        // Keep the transaction "pending" (never "completed") until the full
        // requested amount has been delivered, however many attempts that
        // takes.
        tx.status = fullyCredited ? "completed" : "pending";
        tx.amount = coinsCreditedTotal;
        tx.metadata = {
          ...(tx.metadata || {}),
          coinsCredited: coinsCreditedTotal > 0,
          coinsRequested,
          coinsCreditedTotal,
          coinsWithheldByCap: coinsRequested - coinsCreditedTotal,
          maxCoinsBalance: MAX_USER_COINS_BALANCE,
        };
        await tx.save({ session: dbSession });

        responsePayload = {
          coinsCredited: coinsCreditedTotal,
          creditedThisAttempt: creditResult.credited,
          newBalance: creditResult.newCoins,
          cappedByLimit: !fullyCredited,
          fullyCredited,
          alreadyProcessed: false,
        };
      });

      if (!responsePayload) {
        throw createHttpError(500, "No se pudo procesar la compra");
      }

      if (!responsePayload.fullyCredited) {
        // The purchase is NOT consumed while coins are still owed: Google
        // keeps reporting it as an outstanding/unconsumed purchase, so the
        // client's startup pending-purchase recovery
        // (restorePendingGooglePlayCoinsPurchases) will resubmit the same
        // token later and top up the remainder — safely, since crediting
        // above only ever adds the still-missing amount and never re-grants
        // what was already delivered.
        return res.status(200).json({
          ...responsePayload,
          code: "PURCHASE_PARTIALLY_CREDITED",
          message: `Se acreditaron ${responsePayload.coinsCredited} de las Coins compradas. El resto se entregará automáticamente cuando tengas espacio disponible en tu saldo (máximo ${MAX_USER_COINS_BALANCE} Coins).`,
          maxCoinsBalance: MAX_USER_COINS_BALANCE,
        });
      }

      // Consume on Google's side so the purchase is finalized and the user
      // can buy the same consumable pack again. Only ever reached once the
      // full requested amount has been durably credited (above). Best
      // effort: a network/API failure here must never be surfaced as a
      // user-facing error — it is logged for follow-up and the client's
      // startup pending-purchase recovery (queryPurchases) will retry the
      // consume call (the credit itself safely no-ops, see "already
      // completed" short-circuit above).
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
