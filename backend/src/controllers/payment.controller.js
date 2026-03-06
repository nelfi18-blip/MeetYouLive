const Stripe = require("stripe");
const Video = require("../models/Video.js");
const Purchase = require("../models/Purchase.js");
const User = require("../models/User.js");
const Wallet = require("../models/Wallet.js");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Coin packages: { coins, priceUsd }
const COIN_PACKAGES = {
  100: { coins: 100, priceUsd: 0.99 },
  500: { coins: 500, priceUsd: 4.49 },
  1000: { coins: 1000, priceUsd: 7.99 },
};

const createCoinCheckoutSession = async (req, res) => {
  const { package: pkg } = req.body;
  const coinPackage = COIN_PACKAGES[pkg];
  if (!coinPackage) {
    return res.status(400).json({ message: "Paquete de monedas inválido. Usa 100, 500 o 1000" });
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
        coins: String(coinPackage.coins),
        type: "coins",
      },
      success_url: `${process.env.FRONTEND_URL}/payment/success`,
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
      success_url: `${process.env.FRONTEND_URL}/payment/success`,
      cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const handlePaymentCompleted = async (session) => {
  const { userId, videoId, amount, type, coins } = session.metadata;

  if (type === "coins") {
    const result = await User.findByIdAndUpdate(userId, { $inc: { coins: parseInt(coins, 10) } });
    if (!result) {
      console.error(`[coins webhook] User not found: ${userId} for session ${session.id}`);
    } else {
      await Wallet.create({
        user: userId,
        type: "purchase",
        coins: parseInt(coins, 10),
        stripeSessionId: session.id,
        description: `Compra de ${coins} monedas`,
      });
    }
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

module.exports = { createCheckoutSession, createCoinCheckoutSession, handlePaymentCompleted };
