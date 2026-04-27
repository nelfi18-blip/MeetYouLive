const mongoose = require("mongoose");
const User = require("../models/User.js");
const SparkTransaction = require("../models/SparkTransaction.js");

// Spark packages – users buy these to fuel social boosts and access passes
const SPARK_PACKAGES = [
  {
    id: 50,
    label: "Starter",
    sparks: 50,
    priceUsd: 0.99,
    icon: "✨",
    description: "Ideal para explorar",
    save: null,
  },
  {
    id: 150,
    label: "Explorer",
    sparks: 150,
    priceUsd: 2.49,
    icon: "⚡",
    description: "Más presencia social",
    save: "Ahorra 16%",
  },
  {
    id: 300,
    label: "Popular",
    sparks: 300,
    priceUsd: 4.49,
    icon: "🌟",
    description: "El más elegido",
    save: "Ahorra 24%",
    highlight: true,
  },
  {
    id: 600,
    label: "Elite",
    sparks: 600,
    priceUsd: 7.99,
    icon: "💥",
    description: "Domina la descubierta social",
    save: "Ahorra 32%",
  },
];

// Spark costs for each boost action
const BOOST_COSTS = {
  visibility_boost: 50,  // 24-hour profile visibility boost
  super_interest: 30,    // Super interest / premium match intent
  speed_dating: 100,     // Speed dating access
  room_entry: 75,        // Special social room entry
};

const getPackages = (req, res) => {
  res.json(SPARK_PACKAGES);
};

const getBalance = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("sparks");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json({ sparks: user.sparks });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getTransactions = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const transactions = await SparkTransaction.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await SparkTransaction.countDocuments({ userId: req.userId });

    res.json({ transactions, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const useBoost = async (req, res) => {
  const { boostType } = req.body;
  if (!BOOST_COSTS[boostType]) {
    return res.status(400).json({ message: "Tipo de boost inválido. Usa: " + Object.keys(BOOST_COSTS).join(", ") });
  }
  const cost = BOOST_COSTS[boostType];
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const user = await User.findById(req.userId).session(session);
      if (!user) {
        const err = new Error("Usuario no encontrado");
        err.status = 404;
        throw err;
      }
      if (user.sparks < cost) {
        const err = new Error("Sparks insuficientes para este boost");
        err.status = 400;
        throw err;
      }

      const updated = await User.findByIdAndUpdate(
        req.userId,
        { $inc: { sparks: -cost } },
        { session, new: true }
      );

      await SparkTransaction.create(
        [
          {
            userId: req.userId,
            type: "boost_used",
            amount: -cost,
            reason: `Boost activado: ${boostType}`,
            status: "completed",
            metadata: { boostType },
          },
        ],
        { session }
      );

      result = { remainingSparks: updated.sparks };
    });

    res.json({ message: "Boost activado", boostType, sparkCost: cost, remainingSparks: result.remainingSparks });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ message: err.message });
  } finally {
    session.endSession();
  }
};

module.exports = { getPackages, getBalance, getTransactions, useBoost, SPARK_PACKAGES, BOOST_COSTS };
