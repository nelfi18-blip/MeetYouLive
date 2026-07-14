const Stripe = require("stripe");
const mongoose = require("mongoose");
const Video = require("../models/Video.js");
const Purchase = require("../models/Purchase.js");
const User = require("../models/User.js");
const CoinTransaction = require("../models/CoinTransaction.js");
const SparkTransaction = require("../models/SparkTransaction.js");
const { SPARK_PACKAGES } = require("./sparks.controller.js");
const { COIN_PACKAGES: COIN_PACKAGES_LIST } = require("./coins.controller.js");
const { trackAnalyticsEvent } = require("../services/analytics.service.js");

let stripeClient;

const getStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY && process.env.NODE_ENV !== "test") {
    return null;
  }
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder");
  }
  return stripeClient;
};

const getFrontendUrl = () => process.env.FRONTEND_URL || null;

// Build a lookup map from the canonical COIN_PACKAGES list: { id -> { coins, priceUsd } }
const COIN_PACKAGES = COIN_PACKAGES_LIST.reduce((acc, pkg) => {
  acc[pkg.id] = { id: pkg.id, coins: pkg.coins, priceUsd: pkg.priceUsd };
  return acc;
}, {});

// Build lookup map from the canonical SPARK_PACKAGES list
const SPARK_PACKAGES_MAP = SPARK_PACKAGES.reduce((acc, pkg) => {
  acc[pkg.id] = { sparks: pkg.sparks, priceUsd: pkg.priceUsd };
  return acc;
}, {});

const createCoinCheckoutSession = async (req, res) => {
  const { packageId } = req.body;
  const coinPackage = COIN_PACKAGES[packageId];
  if (!coinPackage) {
    const validIds = COIN_PACKAGES_LIST.map((p) => p.id).join(", ");
    return res.status(400).json({ message: `Paquete de monedas inválido. Usa ${validIds}` });
  }
  try {
    const stripe = getStripe();
    const frontendUrl = getFrontendUrl();
    if (!stripe || !frontendUrl) {
      return res.status(503).json({ message: "Servicio de pagos no configurado" });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: `${coinPackage.coins} monedas MeetYouLive` },
            unit_amount: Math.round(coinPackage.priceUsd * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: req.userId,
        packageId: String(packageId),
        coins: String(coinPackage.coins),
        type: "coins",
      },
      success_url: `${frontendUrl}/payment/success?token={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/payment/cancel`,
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createSparkCheckoutSession = async (req, res) => {
  const { package: pkg } = req.body;
  const sparkPackage = SPARK_PACKAGES_MAP[pkg];
  if (!sparkPackage) {
    return res.status(400).json({ message: "Paquete de sparks inválido. Usa 50, 150, 300 o 600" });
  }
  try {
    const stripe = getStripe();
    const frontendUrl = getFrontendUrl();
    if (!stripe || !frontendUrl) {
      return res.status(503).json({ message: "Servicio de pagos no configurado" });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: `${sparkPackage.sparks} Sparks MeetYouLive` },
            unit_amount: Math.round(sparkPackage.priceUsd * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: req.userId,
        sparks: String(sparkPackage.sparks),
        type: "sparks",
      },
      success_url: `${frontendUrl}/payment/success?token={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/payment/cancel`,
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createCheckoutSession = async (req, res) => {
  try {
    const stripe = getStripe();
    const frontendUrl = getFrontendUrl();
    if (!stripe || !frontendUrl) {
      return res.status(503).json({ message: "Servicio de pagos no configurado" });
    }

    const video = await Video.findById(req.params.videoId);
    if (!video) return res.status(404).json({ message: "Vídeo no encontrado" });
    if (!video.isPrivate || video.price <= 0) {
      return res.status(400).json({ message: "Este vídeo no requiere pago" });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: video.title,
            },
            unit_amount: Math.round(video.price * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: req.userId,
        videoId: String(video._id),
        amount: String(video.price),
        type: "video",
      },
      success_url: `${frontendUrl}/payment/success?token={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/payment/cancel`,
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const handlePaymentCompleted = async (session) => {
  const { userId, videoId, amount, type, coins, sparks } = session.metadata;
  console.log("[stripe payment webhook] checkout.session.completed received", {
    sessionId: session.id,
    mode: session.mode,
    type,
    metadata: session.metadata,
  });

  if (type === "coins") {
    try {
      const packageIdRaw = session.metadata?.packageId || session.metadata?.package || "";
      const packageId = parseInt(packageIdRaw, 10);
      let resolvedPackage = Number.isNaN(packageId) ? null : COIN_PACKAGES[packageId];
      if (!resolvedPackage) {
        // Backward compatibility for previously-created Stripe sessions that
        // did not include packageId in metadata.
        const coinCountFromMetadata = parseInt(coins, 10);
        resolvedPackage = COIN_PACKAGES_LIST.find((pkg) => pkg.coins === coinCountFromMetadata) || null;
        if (resolvedPackage) {
          console.warn("[coins webhook] fallback package lookup used (missing packageId metadata)", {
            sessionId: session.id,
            coinCountFromMetadata,
            resolvedPackageId: resolvedPackage.id,
          });
        }
      }

      console.log("[coins webhook] package lookup", {
        sessionId: session.id,
        packageId: packageIdRaw || null,
        selectedPackage: resolvedPackage ? { id: resolvedPackage.id, coins: resolvedPackage.coins } : null,
      });

      if (!resolvedPackage) {
        console.error("[coins webhook] package not found", {
          sessionId: session.id,
          metadata: session.metadata,
        });
        throw new Error(`Coins package not found for session ${session.id}`);
      }

      const emailFromSession = session.customer_details?.email || session.customer_email || null;
      let user = null;
      if (userId && mongoose.Types.ObjectId.isValid(userId)) {
        user = await User.findById(userId);
      } else if (userId) {
        console.warn("[coins webhook] invalid metadata userId format", {
          sessionId: session.id,
          metadataUserId: userId,
        });
      }
      if (!user && emailFromSession) {
        user = await User.findOne({ email: emailFromSession });
      }

      console.log("[coins webhook] user lookup", {
        sessionId: session.id,
        metadataUserId: userId || null,
        emailFromSession,
        resolvedUserId: user?._id ? String(user._id) : null,
      });

      if (!user) {
        console.error("[coins webhook] user not found", {
          sessionId: session.id,
          metadataUserId: userId || null,
          emailFromSession,
        });
        throw new Error(`User not found for coins webhook session ${session.id}`);
      }

      const previousCoins = user.coins || 0;
      let duplicateCompleted = false;
      let processedTxId = null;
      let updatedCoins = null;
      const dbSession = await mongoose.startSession();
      try {
        await dbSession.withTransaction(async () => {
          let tx = await CoinTransaction.findOne({ "metadata.stripeSessionId": session.id }).session(dbSession);
          if (tx && tx.status === "completed") {
            duplicateCompleted = true;
            processedTxId = String(tx._id);
            return;
          }

          if (!tx) {
            const [createdTx] = await CoinTransaction.create(
              [
                {
                  userId: user._id,
                  type: "purchase",
                  amount: resolvedPackage.coins,
                  reason: `Compra de ${resolvedPackage.coins} MYL Coins via Stripe`,
                  status: "pending",
                  metadata: {
                    stripeSessionId: session.id,
                    amountPaid: session.amount_total,
                    packageId: String(resolvedPackage.id),
                    packageCoins: resolvedPackage.coins,
                    coinsCredited: false,
                  },
                },
              ],
              { session: dbSession }
            );
            tx = createdTx;
            console.log("[coins webhook] transaction created", {
              sessionId: session.id,
              txId: String(tx._id),
              amount: resolvedPackage.coins,
            });
          } else {
            console.log("[coins webhook] existing transaction found, reprocessing", {
              sessionId: session.id,
              txId: String(tx._id),
              status: tx.status,
            });
            tx.status = "pending";
          }

          const updatedUser = await User.findByIdAndUpdate(
            user._id,
            { $inc: { coins: resolvedPackage.coins } },
            { new: true, session: dbSession }
          );
          if (!updatedUser) {
            console.error("[coins webhook] balance update failed (user missing during update)", {
              sessionId: session.id,
              userId: String(user._id),
              txId: String(tx._id),
            });
            tx.status = "failed";
            await tx.save({ session: dbSession });
            throw new Error(`Balance update failed for session ${session.id}`);
          }

          tx.status = "completed";
          tx.metadata = {
            ...(tx.metadata || {}),
            stripeSessionId: session.id,
            amountPaid: session.amount_total,
            packageId: String(resolvedPackage.id),
            packageCoins: resolvedPackage.coins,
            coinsCredited: true,
          };
          await tx.save({ session: dbSession });
          processedTxId = String(tx._id);
          updatedCoins = updatedUser.coins;
        });
      } finally {
        await dbSession.endSession();
      }

      if (duplicateCompleted) {
        console.log("[coins webhook] duplicate completed event ignored", {
          sessionId: session.id,
          txId: processedTxId,
        });
        return;
      }

      console.log("[coins webhook] coin increment success", {
        sessionId: session.id,
        userId: String(user._id),
        txId: processedTxId,
        incrementBy: resolvedPackage.coins,
        previousCoins,
        newCoins: updatedCoins,
      });
      // Analytics: coins_purchased (fire-and-forget)
      trackAnalyticsEvent("coins_purchased", String(user._id), {
        amount_usd: resolvedPackage.priceUsd,
        coins: resolvedPackage.coins,
      });
      return;
    } catch (err) {
      console.error("[coins webhook] caught error while processing", {
        sessionId: session.id,
        metadata: session.metadata,
        message: err.message,
      });
      throw err;
    }
  }

  if (type === "sparks") {
    try {
      const sparkCount = parseInt(sparks, 10);
      if (isNaN(sparkCount) || sparkCount <= 0) {
        console.error("[sparks webhook] Invalid spark count", {
          sessionId: session.id,
          sparks,
        });
        throw new Error(`Invalid spark count for session ${session.id}`);
      }

      const emailFromSession = session.customer_details?.email || session.customer_email || null;
      let user = null;
      if (userId && mongoose.Types.ObjectId.isValid(userId)) {
        user = await User.findById(userId);
      } else if (userId) {
        console.warn("[sparks webhook] invalid metadata userId format", {
          sessionId: session.id,
          metadataUserId: userId,
        });
      }
      if (!user && emailFromSession) {
        user = await User.findOne({ email: emailFromSession });
      }

      if (!user) {
        console.error("[sparks webhook] user not found", {
          sessionId: session.id,
          metadataUserId: userId || null,
          emailFromSession,
        });
        throw new Error(`User not found for sparks webhook session ${session.id}`);
      }

      let duplicateCompleted = false;
      let processedTxId = null;
      const dbSession = await mongoose.startSession();
      try {
        await dbSession.withTransaction(async () => {
          // Check for existing completed transaction
          let tx = await SparkTransaction.findOne({ "metadata.stripeSessionId": session.id }).session(dbSession);
          if (tx && tx.status === "completed") {
            duplicateCompleted = true;
            processedTxId = String(tx._id);
            return;
          }

          // Create or reuse transaction record
          if (!tx) {
            const [createdTx] = await SparkTransaction.create(
              [
                {
                  userId: user._id,
                  type: "purchase",
                  amount: sparkCount,
                  reason: `Compra de ${sparkCount} Sparks via Stripe`,
                  status: "pending",
                  metadata: { stripeSessionId: session.id, amountPaid: session.amount_total },
                },
              ],
              { session: dbSession }
            );
            tx = createdTx;
            console.log("[sparks webhook] transaction created", {
              sessionId: session.id,
              txId: String(tx._id),
              amount: sparkCount,
            });
          } else {
            console.log("[sparks webhook] existing transaction found, reprocessing", {
              sessionId: session.id,
              txId: String(tx._id),
              status: tx.status,
            });
            tx.status = "pending";
          }

          // Atomically update user balance
          const updatedUser = await User.findByIdAndUpdate(
            user._id,
            { $inc: { sparks: sparkCount } },
            { new: true, session: dbSession }
          );

          if (!updatedUser) {
            console.error("[sparks webhook] User not found during update", {
              sessionId: session.id,
              userId: String(user._id),
              txId: String(tx._id),
            });
            tx.status = "failed";
            await tx.save({ session: dbSession });
            throw new Error(`User not found for sparks webhook session ${session.id}`);
          }

          // Mark transaction as completed
          tx.status = "completed";
          await tx.save({ session: dbSession });
          processedTxId = String(tx._id);
        });
      } finally {
        await dbSession.endSession();
      }

      if (duplicateCompleted) {
        console.log("[sparks webhook] duplicate completed event ignored", {
          sessionId: session.id,
          txId: processedTxId,
        });
        return;
      }

      console.log("[sparks webhook] spark increment success", {
        sessionId: session.id,
        userId: String(user._id),
        txId: processedTxId,
        incrementBy: sparkCount,
      });
      return;
    } catch (err) {
      console.error("[sparks webhook] caught error while processing", {
        sessionId: session.id,
        metadata: session.metadata,
        message: err.message,
      });
      throw err;
    }
  }

  // Default: video purchase
  try {
    const existing = await Purchase.findOne({ stripeSessionId: session.id });
    if (existing) {
      console.log("[video webhook] duplicate purchase event ignored", {
        sessionId: session.id,
        purchaseId: String(existing._id),
      });
      return;
    }
    
    await Purchase.create({
      user: userId,
      video: videoId,
      amount: parseFloat(amount),
      stripeSessionId: session.id,
    });
    console.log("[video webhook] purchase recorded", {
      sessionId: session.id,
      userId,
      videoId,
      amount,
    });
  } catch (err) {
    console.error("[video webhook] caught error while processing purchase", {
      sessionId: session.id,
      metadata: session.metadata,
      message: err.message,
    });
    throw err;
  }
};

module.exports = { createCheckoutSession, createCoinCheckoutSession, createSparkCheckoutSession, handlePaymentCompleted };
