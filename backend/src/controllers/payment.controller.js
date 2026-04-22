const Stripe = require("stripe");
const Video = require("../models/Video.js");
const Purchase = require("../models/Purchase.js");
const User = require("../models/User.js");
const CoinTransaction = require("../models/CoinTransaction.js");
const SparkTransaction = require("../models/SparkTransaction.js");
const { SPARK_PACKAGES } = require("./sparks.controller.js");
const { COIN_PACKAGES: COIN_PACKAGES_LIST } = require("./coins.controller.js");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
  const { package: pkg } = req.body;
  const coinPackage = COIN_PACKAGES[pkg];
  if (!coinPackage) {
    const validIds = COIN_PACKAGES_LIST.map((p) => p.id).join(", ");
    return res.status(400).json({ message: `Paquete de monedas inválido. Usa ${validIds}` });
  }
  try {
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
        packageId: String(pkg),
        coins: String(coinPackage.coins),
        type: "coins",
      },
      success_url: `${process.env.FRONTEND_URL}/payment/success?token={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
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
      success_url: `${process.env.FRONTEND_URL}/payment/success?token={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createCheckoutSession = async (req, res) => {
  try {
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
      success_url: `${process.env.FRONTEND_URL}/payment/success?token={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
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
      let selectedPackage = Number.isNaN(packageId) ? null : COIN_PACKAGES[packageId];
      if (!selectedPackage) {
        const coinCountFromMetadata = parseInt(coins, 10);
        selectedPackage = COIN_PACKAGES_LIST.find((pkg) => pkg.coins === coinCountFromMetadata) || null;
      }

      console.log("[coins webhook] package lookup", {
        sessionId: session.id,
        packageId: packageIdRaw || null,
        selectedPackage: selectedPackage ? { id: selectedPackage.id, coins: selectedPackage.coins } : null,
      });

      if (!selectedPackage) {
        console.error("[coins webhook] package not found", {
          sessionId: session.id,
          metadata: session.metadata,
        });
        throw new Error(`Coins package not found for session ${session.id}`);
      }

      const emailFromSession = session.customer_details?.email || session.customer_email || null;
      let user = null;
      if (userId) {
        user = await User.findById(userId);
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

      let tx = await CoinTransaction.findOne({ "metadata.stripeSessionId": session.id });
      if (tx && tx.status === "completed") {
        console.log("[coins webhook] duplicate completed event ignored", {
          sessionId: session.id,
          txId: String(tx._id),
        });
        return;
      }

      if (!tx) {
        tx = await CoinTransaction.create({
          userId: user._id,
          type: "purchase",
          amount: selectedPackage.coins,
          reason: `Compra de ${selectedPackage.coins} MYL Coins via Stripe`,
          status: "pending",
          metadata: {
            stripeSessionId: session.id,
            amountPaid: session.amount_total,
            packageId: String(selectedPackage.id),
            packageCoins: selectedPackage.coins,
          },
        });
        console.log("[coins webhook] transaction created", {
          sessionId: session.id,
          txId: String(tx._id),
          amount: selectedPackage.coins,
        });
      } else {
        console.log("[coins webhook] existing transaction found, reprocessing", {
          sessionId: session.id,
          txId: String(tx._id),
          status: tx.status,
        });
      }

      const previousCoins = user.coins || 0;
      const updatedUser = await User.findByIdAndUpdate(user._id, { $inc: { coins: selectedPackage.coins } }, { new: true });
      if (!updatedUser) {
        console.error("[coins webhook] balance update failed (user missing during update)", {
          sessionId: session.id,
          userId: String(user._id),
          txId: String(tx._id),
        });
        await CoinTransaction.findByIdAndUpdate(tx._id, { status: "failed" });
        throw new Error(`Balance update failed for session ${session.id}`);
      }

      await CoinTransaction.findByIdAndUpdate(tx._id, { status: "completed" });
      console.log("[coins webhook] coin increment success", {
        sessionId: session.id,
        userId: String(user._id),
        txId: String(tx._id),
        incrementBy: selectedPackage.coins,
        previousCoins,
        newCoins: updatedUser.coins,
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
    const sparkCount = parseInt(sparks, 10);
    // Idempotency check
    const existingTx = await SparkTransaction.findOne({ "metadata.stripeSessionId": session.id });
    if (existingTx) {
      console.warn(`[sparks webhook] Duplicate event for session ${session.id}, skipping`);
      return;
    }
    const tx = await SparkTransaction.create({
      userId,
      type: "purchase",
      amount: sparkCount,
      reason: `Compra de ${sparkCount} Sparks via Stripe`,
      status: "pending",
      metadata: { stripeSessionId: session.id, amountPaid: session.amount_total },
    });
    const result = await User.findByIdAndUpdate(userId, { $inc: { sparks: sparkCount } });
    if (!result) {
      console.error(`[sparks webhook] User not found: ${userId} for session ${session.id}`);
      await SparkTransaction.findByIdAndUpdate(tx._id, { status: "failed" });
      return;
    }
    await SparkTransaction.findByIdAndUpdate(tx._id, { status: "completed" });
    return;
  }

  // Default: video purchase
  const existing = await Purchase.findOne({ stripeSessionId: session.id });
  if (!existing) {
    await Purchase.create({
      user: userId,
      video: videoId,
      amount: parseFloat(amount),
      stripeSessionId: session.id,
    });
  }
};

module.exports = { createCheckoutSession, createCoinCheckoutSession, createSparkCheckoutSession, handlePaymentCompleted };
