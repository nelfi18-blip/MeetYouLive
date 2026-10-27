const CoinTransaction = require("../models/CoinTransaction.js");

// Canonical coin package definitions. These are the single source of truth
// for both the public packages listing endpoint and the Stripe checkout flow.
//
// `googlePlayProductId` is the stable in-app product ID that MUST be created
// (one-time/managed product, consumable) under this exact string in Google
// Play Console → Monetize → Products → In-app products, for package
// `applicationId` com.meetyoulive.app. These IDs are the single source of
// truth for the Android native purchase flow — see
// backend/src/controllers/googlePlayPurchase.controller.js and
// docs/GOOGLE_PLAY_BILLING_SETUP.md.
const COIN_PACKAGES = [
  {
    id: 100,
    label: "Starter Pack",
    coins: 100,
    priceUsd: 4.99,
    icon: "🪙",
    description: "Ideal para empezar a conectar",
    save: null,
    googlePlayProductId: "coins_pack_100",
  },
  {
    id: 250,
    label: "Popular Pack",
    coins: 250,
    priceUsd: 9.99,
    icon: "💰",
    description: "El más elegido por la comunidad",
    save: "Más popular",
    highlight: true,
    googlePlayProductId: "coins_pack_250",
  },
  {
    id: 700,
    label: "Elite Pack",
    coins: 700,
    priceUsd: 19.99,
    icon: "💎",
    description: "Mejor valor · Vive la experiencia completa",
    save: "Mejor valor",
    googlePlayProductId: "coins_pack_700",
  },
];

const getPackages = (req, res) => {
  res.json(COIN_PACKAGES);
};

const getTransactions = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const transactions = await CoinTransaction.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await CoinTransaction.countDocuments({ userId: req.userId });

    res.json({
      transactions,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getPackages, getTransactions, COIN_PACKAGES };
