const CoinTransaction = require("../models/CoinTransaction.js");

const COIN_PACKAGES = [
  {
    id: 100,
    label: "Starter Pack",
    coins: 100,
    priceUsd: 0.99,
    icon: "🪙",
    description: "Ideal para empezar",
    save: null,
  },
  {
    id: 250,
    label: "Explorer Pack",
    coins: 250,
    priceUsd: 2.29,
    icon: "🎯",
    description: "Más MYL Coins para disfrutar",
    save: "Ahorra 8%",
  },
  {
    id: 500,
    label: "Popular Pack",
    coins: 500,
    priceUsd: 4.49,
    icon: "💰",
    description: "El más elegido por la comunidad",
    save: "Ahorra 9%",
    highlight: true,
  },
  {
    id: 1000,
    label: "Elite Pack",
    coins: 1000,
    priceUsd: 7.99,
    icon: "💎",
    description: "Mejor precio por MYL Coin",
    save: "Ahorra 19%",
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
