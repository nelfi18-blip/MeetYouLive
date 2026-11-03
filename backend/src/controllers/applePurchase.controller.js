const mongoose = require("mongoose");
const User = require("../models/User.js");
const CoinTransaction = require("../models/CoinTransaction.js");
const { COIN_PACKAGES } = require("./coins.controller.js");
const { MAX_USER_COINS_BALANCE, creditCoinsWithCap } = require("../services/coins.service.js");
const appleStoreKit = require("../services/appleStoreKit.service.js");
const { deriveAppAccountToken } = require("../services/appleAccountToken.service.js");
const { trackSafeAnalyticsEvent } = require("../services/analytics.service.js");

const trackMilestoneEvent = typeof trackSafeAnalyticsEvent === "function" ? trackSafeAnalyticsEvent : () => {};

const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 80;

// productId -> canonical package, built from the same COIN_PACKAGES list used
// by the Stripe/Google Play flows so the three existing packages
// (100/250/700) are the only ones ever creditable through this endpoint.
const PRODUCT_ID_TO_PACKAGE = COIN_PACKAGES.reduce((acc, pkg) => {
  if (pkg.appleProductId) acc[pkg.appleProductId] = pkg;
  return acc;
}, {});

function createHttpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
}

/**
 * Returns true when an error is a MongoDB *transient* write-conflict —
 * i.e. the transaction definitely did NOT commit and it is always safe to
 * immediately re-run it from scratch. This must NEVER include
 * "UnknownTransactionCommitResult": that label means the commit's outcome
 * is unknown (it may have actually succeeded), so blindly re-running the
 * credit step on that label could double-credit Coins. See
 * isUnknownCommitResultError() below, which is handled on a separate,
 * non-retrying path. Mirrors googlePlayPurchase.controller.js exactly.
 */
function isWriteConflictError(err) {
  if (!err) return false;
  if (err.code === 112) return true;
  if (typeof err.message === "string" && err.message.includes("Write conflict")) return true;
  if (typeof err.hasErrorLabel === "function" && err.hasErrorLabel("TransientTransactionError")) return true;
  return false;
}

/**
 * Returns true when the Mongo driver reports that a transaction commit's
 * outcome is unknown. The transaction may have actually committed on the
 * server even though the client never received confirmation — so this is
 * NOT a signal to retry crediting. It must be resolved by reading back the
 * durable, authoritative CoinTransaction record instead (see
 * reconcileUnknownCommitResult()).
 */
function isUnknownCommitResultError(err) {
  if (!err) return false;
  return typeof err.hasErrorLabel === "function" && err.hasErrorLabel("UnknownTransactionCommitResult");
}

/**
 * Safely resolves an ambiguous transaction outcome ("the commit may or may
 * not have gone through") without ever crediting coins again.
 *
 * Reads the persisted CoinTransaction scoped to BOTH the exact
 * appleTransactionId AND the authenticated user (req.userId) — the same
 * account-binding guarantee enforced on the primary path — so a commit
 * that actually belongs to a different account can never be picked up
 * here either.
 */
async function reconcileUnknownCommitResult({ req, res, transactionId, coinPackage }) {
  console.error("[apple-iap] transaction commit result unknown — reconciling from persisted state before taking any further action", {
    productId: coinPackage.appleProductId,
    userId: req.userId,
  });

  let tx;
  try {
    tx = await CoinTransaction.findOne({ "metadata.appleTransactionId": transactionId, userId: req.userId });
  } catch (lookupErr) {
    console.error("[apple-iap] reconciliation lookup failed after unknown commit result", { message: lookupErr.message });
    tx = null;
  }

  if (!tx) {
    return res.status(202).json({
      message: "No se pudo confirmar tu compra todavía. Vuelve a intentarlo en unos segundos; no se te cobrará de nuevo.",
      code: "PURCHASE_RECONCILIATION_PENDING",
    });
  }

  const coinsRequested = Number(tx.metadata?.coinsRequested) || coinPackage.coins;
  const coinsCreditedTotal = Number(tx.metadata?.coinsCreditedTotal) || tx.amount || 0;
  const fullyCredited = tx.status === "completed" && coinsCreditedTotal >= coinsRequested;

  if (fullyCredited) {
    return res.json({
      coinsCredited: coinsCreditedTotal,
      newBalance: null,
      alreadyProcessed: true,
      fullyCredited: true,
    });
  }

  return res.status(200).json({
    coinsCredited: coinsCreditedTotal,
    newBalance: null,
    alreadyProcessed: true,
    fullyCredited: false,
    cappedByLimit: coinsCreditedTotal < coinsRequested,
    code: "PURCHASE_PARTIALLY_CREDITED",
    message: `Se acreditaron ${coinsCreditedTotal} de las Coins compradas. El resto se entregará automáticamente cuando tengas espacio disponible en tu saldo (máximo ${MAX_USER_COINS_BALANCE} Coins).`,
    maxCoinsBalance: MAX_USER_COINS_BALANCE,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Validates and credits an Apple StoreKit 2 Consumable in-app purchase for
 * Coins.
 *
 * Security model:
 *  - The client only ever sends `productId` + `transactionId` (opaque,
 *    Apple-issued). No coin amount or price is ever accepted from the
 *    client — the credited amount always comes from the server's own
 *    COIN_PACKAGES lookup for the validated productId.
 *  - `transactionId` is independently verified against the App Store
 *    Server API (Get Transaction Info) and its JWS signature is verified
 *    against Apple's root certificates — the only source of truth for
 *    product identity/quantity/refund state. A request is never trusted
 *    on its own.
 *  - `appAccountToken` (set by the client via
 *    Product.PurchaseOption.appAccountToken(deriveAppAccountToken(userId))
 *    before launching the purchase) must match the UUID deterministically
 *    derived from the authenticated user, so a transaction obtained under
 *    one account can never be redeemed by a different authenticated
 *    session.
 *  - Crediting is idempotent: CoinTransaction has a unique index on
 *    `metadata.appleTransactionId`, and the credit + transaction write
 *    happen in one Mongo transaction, so retries/duplicate
 *    submissions/concurrent requests for the same transaction can never
 *    credit coins twice.
 *  - Unlike Google Play Billing, Apple's Consumable purchases have no
 *    separate server-side "consume" step — the transaction existing *is*
 *    the durable proof of purchase, so there is nothing to finalize after
 *    crediting.
 */
const verifyApplePurchase = async (req, res) => {
  const { productId, transactionId } = req.body;

  const coinPackage = PRODUCT_ID_TO_PACKAGE[productId];
  if (!coinPackage) {
    return res.status(400).json({ message: "Producto de Apple no reconocido" });
  }

  if (!appleStoreKit.isConfigured()) {
    console.error("[apple-iap] verifyApplePurchase called but Apple IAP server validation is not configured");
    return res.status(503).json({ message: "La validación de compras de Apple no está configurada" });
  }

  let transaction;
  try {
    transaction = await appleStoreKit.getVerifiedTransaction(transactionId, productId);
  } catch (err) {
    console.error("[apple-iap] transaction lookup/verification failed", {
      productId,
      status: err.status,
      code: err.code,
      message: err.message,
    });
    if (err.status === 422) {
      // Strict verification failure (wrong product, type, or quantity) —
      // never credit on a mismatch.
      return res.status(422).json({
        message: "La compra de Apple no pudo validarse de forma segura",
        code: err.code,
      });
    }
    const status = err.status === 404 ? 404 : 502;
    return res.status(status).json({
      message: "No se pudo verificar la compra con Apple",
    });
  }

  if (transaction.refunded) {
    return res.status(409).json({
      message: "Esta compra fue reembolsada y no puede acreditarse",
      code: "PURCHASE_REFUNDED",
    });
  }

  // Binds the transaction to the authenticated user. The client always
  // sets this via Product.PurchaseOption.appAccountToken(token) before
  // launching StoreKit's purchase sheet, where `token` is
  // deriveAppAccountToken(session.user.id) — the exact same deterministic
  // derivation the backend recomputes from req.userId (see
  // appleAccountToken.service.js). This check is MANDATORY, not
  // best-effort: an appAccountToken is NEVER treated as proof of ownership
  // unless it matches. Fail closed in both the "missing" (already rejected
  // in appleStoreKit.service.js) and "mismatch" cases.
  const expectedAccountToken = deriveAppAccountToken(req.userId);
  if (transaction.appAccountToken !== expectedAccountToken) {
    console.error("[apple-iap] transaction appAccountToken does not match the authenticated user's derived token", {
      productId,
      userId: req.userId,
    });
    return res.status(403).json({
      message: "Esta compra no corresponde a tu cuenta",
      code: "PURCHASE_ACCOUNT_MISMATCH",
    });
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const dbSession = await mongoose.startSession();
    try {
      let responsePayload = null;

      await dbSession.withTransaction(async () => {
        let tx = await CoinTransaction.findOne({ "metadata.appleTransactionId": transactionId }).session(dbSession);

        if (tx && tx.status === "completed") {
          // Fully delivered by a prior request (retry, duplicate delivery,
          // or restored transaction) — never credit twice.
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
                reason: `Compra de ${coinPackage.coins} MYL Coins via Apple In-App Purchase`,
                status: "pending",
                metadata: {
                  appleTransactionId: transactionId,
                  productId,
                  packageId: String(coinPackage.id),
                  packageCoins: coinPackage.coins,
                  platform: "apple_iap",
                  appleEnvironment: transaction.environment,
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
        // delivered so far. A purchase is only ever "completed" once the
        // FULL amount has been credited — this is what makes a
        // MAX_USER_COINS_BALANCE cap safe to recover from: nothing is
        // silently written off as delivered, nothing is double-credited
        // on a later retry.
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
          console.error("[apple-iap] MAX_USER_COINS_BALANCE reached — purchase only partially delivered, left pending for later recovery", {
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
        // Not consumed/finished on Apple's side while coins are still
        // owed: the client's startup pending-purchase recovery
        // (restorePendingAppleCoinsPurchases) will resubmit the same
        // transaction later and top up the remainder — safely, since
        // crediting above only ever adds the still-missing amount and
        // never re-grants what was already delivered.
        return res.status(200).json({
          ...responsePayload,
          code: "PURCHASE_PARTIALLY_CREDITED",
          message: `Se acreditaron ${responsePayload.coinsCredited} de las Coins compradas. El resto se entregará automáticamente cuando tengas espacio disponible en tu saldo (máximo ${MAX_USER_COINS_BALANCE} Coins).`,
          maxCoinsBalance: MAX_USER_COINS_BALANCE,
        });
      }

      if (!responsePayload.alreadyProcessed) {
        trackMilestoneEvent("coins_purchase_completed", String(req.userId), {
          packageId: String(coinPackage.id),
          coins: responsePayload.coinsCredited,
          platform: "apple_iap",
        });
      }

      return res.json(responsePayload);
    } catch (err) {
      if (isUnknownCommitResultError(err)) {
        // Never re-run the credit step here: the commit may have actually
        // succeeded. Break out of the retry loop entirely and resolve the
        // outcome from the durable, authoritative record instead.
        return reconcileUnknownCommitResult({ req, res, transactionId, coinPackage });
      }
      if (isWriteConflictError(err) && attempt < MAX_RETRIES) {
        await sleep(RETRY_BACKOFF_MS * Math.pow(2, attempt - 1));
        continue;
      }
      if (err && err.code === 11000) {
        // Another concurrent request is already processing this exact
        // transactionId (unique index race). Safe for the client to retry;
        // it will resolve to the already-completed transaction.
        return res.status(409).json({ message: "Esta compra ya se está procesando", code: "PURCHASE_IN_PROGRESS" });
      }
      const status = Number.isInteger(err?.status) ? err.status : 500;
      console.error("[apple-iap] verifyApplePurchase failed", { message: err?.message, status, code: err?.code });
      return res.status(status).json({
        message: err?.message || "Error interno del servidor",
        ...(err?.code ? { code: err.code } : {}),
      });
    } finally {
      await dbSession.endSession();
    }
  }
};

module.exports = { verifyApplePurchase, PRODUCT_ID_TO_PACKAGE };
