const mongoose = require("mongoose");
const Gift = require("../models/Gift");
const User = require("../models/User");
const Payout = require("../models/Payout");

const requireApprovedCreator = async (userId) => {
  const user = await User.findById(userId).select(
    "role creatorStatus username name creatorApprovedAt earningsCoins coins agencyEarningsCoins"
  );

  if (!user || user.role !== "creator" || user.creatorStatus !== "approved") {
    return { error: "Acceso restringido a creadores aprobados.", user: null };
  }

  return { error: null, user };
};

exports.getCreatorStats = async (req, res) => {
  try {
    const userId = req.userId || req.user?.id;
    const { error, user } = await requireApprovedCreator(userId);

    if (error) {
      return res.status(403).json({ ok: false, message: error });
    }

    const aggregateResult = await Gift.aggregate([
      { $match: { receiver: new mongoose.Types.ObjectId(user._id) } },
      {
        $group: {
          _id: null,
          totalCoinsReceived: { $sum: "$coinCost" },
          totalCreatorShare: { $sum: "$creatorShare" },
          totalGiftCount: { $sum: 1 },
        },
      },
    ]);

    const liveCount = await mongoose.model("Live").countDocuments({
      user: user._id,
      status: { $in: ["live", "active"] },
    }).catch(() => 0);

    const pendingPayout = await Payout.findOne({
      creator: user._id,
      status: { $in: ["pending", "processing"] },
    }).sort({ createdAt: -1 });

    const totals = aggregateResult[0] || {
      totalCoinsReceived: 0,
      totalCreatorShare: 0,
      totalGiftCount: 0,
    };

    return res.json({
      ok: true,
      earningsCoins: user.earningsCoins || 0,
      agencyEarningsCoins: user.agencyEarningsCoins || 0,
      coins: user.coins || 0,
      totalLives: liveCount,
      totalGifts: totals.totalGiftCount || 0,
      totalCoinsReceived: totals.totalCoinsReceived || 0,
      totalCreatorShare: totals.totalCreatorShare || 0,
      pendingPayout: pendingPayout
        ? {
            _id: pendingPayout._id,
            amountCoins: pendingPayout.amountCoins,
            status: pendingPayout.status,
            createdAt: pendingPayout.createdAt,
          }
        : null,
    });
  } catch (err) {
    console.error("getCreatorStats error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Error interno del servidor" });
  }
};

exports.getCreatorEarnings = async (req, res) => {
  try {
    const userId = req.userId || req.user?.id;
    const { error, user } = await requireApprovedCreator(userId);

    if (error) {
      return res.status(403).json({ ok: false, message: error });
    }

    const aggregateResult = await Gift.aggregate([
      { $match: { receiver: new mongoose.Types.ObjectId(user._id) } },
      {
        $group: {
          _id: null,
          totalCoinsReceived: { $sum: "$coinCost" },
          totalCreatorShare: { $sum: "$creatorShare" },
          totalPlatformShare: { $sum: "$platformShare" },
          totalGiftCount: { $sum: 1 },
        },
      },
    ]);

    const recentTransactions = await Gift.find({ receiver: user._id })
      .populate("sender", "username name avatar")
      .populate("giftCatalogItem")
      .sort({ createdAt: -1 })
      .limit(20);

    const totals = aggregateResult[0] || {
      totalCoinsReceived: 0,
      totalCreatorShare: 0,
      totalPlatformShare: 0,
      totalGiftCount: 0,
    };

    return res.json({
      ok: true,
      totalCoinsReceived: totals.totalCoinsReceived,
      totalCreatorShare: totals.totalCreatorShare,
      totalPlatformShare: totals.totalPlatformShare,
      totalGiftCount: totals.totalGiftCount,
      recentTransactions,
    });
  } catch (err) {
    console.error("getCreatorEarnings error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Error interno del servidor" });
  }
};

exports.requestPayout = async (req, res) => {
  try {
    const userId = req.userId || req.user?.id;
    const { error, user } = await requireApprovedCreator(userId);

    if (error) {
      return res.status(403).json({ ok: false, message: error });
    }

    const MIN_PAYOUT_COINS = 100;
    const available = user.earningsCoins || 0;

    if (available < MIN_PAYOUT_COINS) {
      return res.status(400).json({
        ok: false,
        message: "No tienes el mínimo requerido para solicitar retiro.",
        minRequired: MIN_PAYOUT_COINS,
        current: available,
      });
    }

    const existingPending = await Payout.findOne({
      creator: user._id,
      status: { $in: ["pending", "processing"] },
    });

    if (existingPending) {
      return res.status(409).json({
        ok: false,
        message: "Ya tienes una solicitud de retiro pendiente.",
        payout: {
          _id: existingPending._id,
          amountCoins: existingPending.amountCoins,
          status: existingPending.status,
          createdAt: existingPending.createdAt,
        },
      });
    }

    const updatedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        earningsCoins: available,
      },
      {
        $set: { earningsCoins: 0 },
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(409).json({
        ok: false,
        message:
          "No se pudo procesar el retiro porque tu balance cambió. Inténtalo de nuevo.",
      });
    }

    const payout = await Payout.create({
      creator: user._id,
      amountCoins: available,
      status: "pending",
      notes: "Solicitud creada automáticamente desde creator dashboard.",
    });

    return res.json({
      ok: true,
      message: "Solicitud de retiro registrada correctamente.",
      payout: {
        _id: payout._id,
        amountCoins: payout.amountCoins,
        status: payout.status,
        createdAt: payout.createdAt,
      },
    });
  } catch (err) {
    console.error("requestPayout error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Error interno del servidor" });
  }
};
