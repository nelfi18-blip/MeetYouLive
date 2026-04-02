const mongoose = require("mongoose");
const Gift = require("../models/Gift.js");
const User = require("../models/User.js");

const assertApprovedCreator = async (userId, fields = "role creatorStatus") => {
  const creator = await User.findById(userId).select(fields);
  if (!creator) {
    const err = new Error("Usuario no encontrado");
    err.statusCode = 404;
    throw err;
  }
  if (creator.role !== "creator" || creator.creatorStatus !== "approved") {
    const err = new Error("Acceso restringido a creadores aprobados");
    err.statusCode = 403;
    throw err;
  }
  return creator;
};

const aggregateGiftTotals = (userId) =>
  Gift.aggregate([
    { $match: { receiver: new mongoose.Types.ObjectId(userId) } },
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

const emptyTotals = {
  totalCoinsReceived: 0,
  totalCreatorShare: 0,
  totalPlatformShare: 0,
  totalGiftCount: 0,
};

const getCreatorStats = async (req, res) => {
  try {
    const userId = req.userId;

    const creator = await assertApprovedCreator(
      userId,
      "role creatorStatus username name creatorApprovedAt"
    );

    const aggregateResult = await aggregateGiftTotals(userId);
    const totals = aggregateResult[0] || emptyTotals;

    return res.json({
      ok: true,
      creator: {
        username: creator.username,
        name: creator.name,
        creatorApprovedAt: creator.creatorApprovedAt,
      },
      ...totals,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ ok: false, message: err.message });
    }
    console.error("getCreatorStats error:", err);
    return res.status(500).json({ ok: false, message: "Error interno del servidor" });
  }
};

const getCreatorEarnings = async (req, res) => {
  try {
    const userId = req.userId;

    await assertApprovedCreator(
      userId,
      "role creatorStatus username name creatorApprovedAt"
    );

    const [aggregateResult, recentTransactions] = await Promise.all([
      aggregateGiftTotals(userId),
      Gift.find({ receiver: userId })
        .populate("sender", "username name avatar")
        .populate("giftCatalogItem")
        .sort({ createdAt: -1 })
        .limit(20),
    ]);

    const totals = aggregateResult[0] || emptyTotals;

    return res.json({
      ok: true,
      totalCoinsReceived: totals.totalCoinsReceived,
      totalCreatorShare: totals.totalCreatorShare,
      totalPlatformShare: totals.totalPlatformShare,
      totalGiftCount: totals.totalGiftCount,
      recentTransactions,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ ok: false, message: err.message });
    }
    console.error("getCreatorEarnings error:", err);
    return res.status(500).json({ ok: false, message: "Error interno del servidor" });
  }
};

const requestPayout = async (req, res) => {
  try {
    await assertApprovedCreator(req.userId, "role creatorStatus");

    return res.json({
      ok: true,
      message: "Solicitud de retiro registrada. Stripe Connect se conectará en la siguiente fase.",
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ ok: false, message: err.message });
    }
    console.error("requestPayout error:", err);
    return res.status(500).json({ ok: false, message: "Error interno del servidor" });
  }
};

module.exports = { getCreatorStats, getCreatorEarnings, requestPayout };
