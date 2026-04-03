const Gift = require("../models/Gift.js");
const Live = require("../models/Live.js");
const Payout = require("../models/Payout.js");
const User = require("../models/User.js");
const ExclusiveContent = require("../models/ExclusiveContent.js");
const AgencyRelationship = require("../models/AgencyRelationship.js");

const MIN_PAYOUT_COINS = 100;

const requireApprovedCreator = async (userId) => {
  const user = await User.findById(userId).select(
    "role creatorStatus earningsCoins coins agencyEarningsCoins agencyProfile"
  );
  if (!user || user.role !== "creator" || user.creatorStatus !== "approved") {
    return { error: "Acceso restringido a creadores aprobados.", user: null };
  }
  return { error: null, user };
};

const getCreatorStats = async (req, res) => {
  try {
    const { error, user } = await requireApprovedCreator(req.userId);
    if (error) return res.status(403).json({ message: error });

    const [aggResult, totalLives, pendingPayout] = await Promise.all([
      Gift.aggregate([
        { $match: { receiver: user._id } },
        {
          $group: {
            _id: null,
            totalCoinsReceived: { $sum: "$coinCost" },
            totalCreatorShare: { $sum: "$creatorShare" },
            totalGiftCount: { $sum: 1 },
          },
        },
      ]),
      Live.countDocuments({ user: user._id }),
      Payout.findOne({ creator: user._id, status: { $in: ["pending", "processing"] } })
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const totals = aggResult[0] || {
      totalCoinsReceived: 0,
      totalCreatorShare: 0,
      totalGiftCount: 0,
    };

    res.json({
      earningsCoins: user.earningsCoins,
      coins: user.coins,
      totalLives,
      totalGifts: totals.totalGiftCount,
      totalCoinsReceived: totals.totalCoinsReceived,
      totalCreatorShare: totals.totalCreatorShare,
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
    res.status(500).json({ message: err.message });
  }
};

const getCreatorEarnings = async (req, res) => {
  try {
    const { error, user } = await requireApprovedCreator(req.userId);
    if (error) return res.status(403).json({ message: error });

    const [aggResult, recentGifts] = await Promise.all([
      Gift.aggregate([
        { $match: { receiver: user._id } },
        {
          $group: {
            _id: null,
            totalCoinsReceived: { $sum: "$coinCost" },
            totalCreatorShare: { $sum: "$creatorShare" },
            totalPlatformShare: { $sum: "$platformShare" },
            totalGiftCount: { $sum: 1 },
          },
        },
      ]),
      Gift.find({ receiver: req.userId })
        .populate("sender", "username name")
        .populate("giftCatalogItem", "name icon coinCost")
        .sort({ createdAt: -1 })
        .limit(20),
    ]);

    const totals = aggResult[0] || {
      totalCoinsReceived: 0,
      totalCreatorShare: 0,
      totalPlatformShare: 0,
      totalGiftCount: 0,
    };

    const recentTransactions = recentGifts.map((g) => ({
      _id: g._id,
      sender: g.sender ? { username: g.sender.username, name: g.sender.name } : null,
      giftName: g.giftCatalogItem?.name || "Regalo",
      giftIcon: g.giftCatalogItem?.icon || "🎁",
      coinCost: g.coinCost,
      creatorShare: g.creatorShare,
      platformShare: g.platformShare,
      context: g.context,
      createdAt: g.createdAt,
    }));

    res.json({ ...totals, recentTransactions });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const requestPayout = async (req, res) => {
  try {
    const { error, user } = await requireApprovedCreator(req.userId);
    if (error) return res.status(403).json({ message: error });

    if (user.earningsCoins < MIN_PAYOUT_COINS) {
      return res.status(400).json({
        message: `Necesitas al menos ${MIN_PAYOUT_COINS} monedas de ganancias para solicitar un pago.`,
        minRequired: MIN_PAYOUT_COINS,
        current: user.earningsCoins,
      });
    }

    const existingPayout = await Payout.findOne({
      creator: user._id,
      status: { $in: ["pending", "processing"] },
    });
    if (existingPayout) {
      return res.status(409).json({
        message: "Ya tienes una solicitud de pago en proceso.",
        payout: {
          _id: existingPayout._id,
          amountCoins: existingPayout.amountCoins,
          status: existingPayout.status,
          createdAt: existingPayout.createdAt,
        },
      });
    }

    const amount = user.earningsCoins;

    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id, earningsCoins: amount },
      { $set: { earningsCoins: 0 } },
      { new: true }
    );
    if (!updatedUser) {
      return res.status(409).json({ message: "Las ganancias cambiaron, intenta de nuevo." });
    }

    const payout = await Payout.create({ creator: user._id, amountCoins: amount });

    res.status(201).json({
      message: "Solicitud de pago enviada correctamente.",
      payout: {
        _id: payout._id,
        amountCoins: payout.amountCoins,
        status: payout.status,
        createdAt: payout.createdAt,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getCreatorDashboard = async (req, res) => {
  try {
    const { error, user } = await requireApprovedCreator(req.userId);
    if (error) return res.status(403).json({ message: error });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [aggResult, todayAgg, recentGifts, activeLive, pendingPayout, agencyCountsAgg, exclusiveContentCount] = await Promise.all([
      Gift.aggregate([
        { $match: { receiver: user._id } },
        {
          $group: {
            _id: null,
            totalCreatorShare: { $sum: "$creatorShare" },
            totalGiftCount: { $sum: 1 },
          },
        },
      ]),
      Gift.aggregate([
        { $match: { receiver: user._id, createdAt: { $gte: todayStart } } },
        { $group: { _id: null, todayCoins: { $sum: "$creatorShare" } } },
      ]),
      Gift.find({ receiver: user._id })
        .populate("sender", "username name")
        .populate("giftCatalogItem", "name icon coinCost")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Live.findOne({ user: user._id, isLive: true })
        .select("_id title viewerCount isPrivate chatEnabled giftsEnabled createdAt")
        .lean(),
      Payout.findOne({ creator: user._id, status: { $in: ["pending", "processing"] } })
        .sort({ createdAt: -1 })
        .lean(),
      AgencyRelationship.aggregate([
        { $match: { parentCreator: user._id, status: { $in: ["pending", "active"] } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      ExclusiveContent.countDocuments({ creator: user._id }),
    ]);

    const totals = aggResult[0] || { totalCreatorShare: 0, totalGiftCount: 0 };
    const todayCoins = todayAgg[0]?.todayCoins || 0;

    const agencyCounts = { total: 0, active: 0, pending: 0 };
    for (const row of agencyCountsAgg) {
      agencyCounts.total += row.count;
      if (row._id === "active") agencyCounts.active = row.count;
      if (row._id === "pending") agencyCounts.pending = row.count;
    }

    const gifts = recentGifts.map((g) => ({
      _id: g._id,
      senderName: g.sender?.username || g.sender?.name || "Anónimo",
      giftName: g.giftCatalogItem?.name || "Regalo",
      giftIcon: g.giftCatalogItem?.icon || "🎁",
      creatorShare: g.creatorShare,
      createdAt: g.createdAt,
    }));

    res.json({
      // earningsCoins: current withdrawable balance (decreases after payout requests)
      earningsCoins: user.earningsCoins,
      agencyEarningsCoins: user.agencyEarningsCoins || 0,
      todayCoins,
      // totalCreatorShare: historical cumulative earnings from gifts (never decreases)
      totalCreatorShare: totals.totalCreatorShare,
      totalGifts: totals.totalGiftCount,
      activeLive: activeLive || null,
      recentGifts: gifts,
      pendingPayout: pendingPayout
        ? {
            _id: pendingPayout._id,
            amountCoins: pendingPayout.amountCoins,
            status: pendingPayout.status,
            createdAt: pendingPayout.createdAt,
          }
        : null,
      agencyEnabled: !!user.agencyProfile?.enabled,
      agencyCounts,
      exclusiveContentCount,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getCreatorStats, getCreatorEarnings, requestPayout, getCreatorDashboard };
