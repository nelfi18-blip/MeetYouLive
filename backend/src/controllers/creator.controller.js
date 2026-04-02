const mongoose = require("mongoose");
const Gift = require("../models/Gift.js");
const User = require("../models/User.js");

const requireApprovedCreator = async (userId) => {
  const user = await User.findById(userId).select("role creatorStatus");
  if (!user || user.role !== "creator" || user.creatorStatus !== "approved") {
    return null;
  }
  return user;
};

const getEarnings = async (req, res) => {
  try {
    const user = await requireApprovedCreator(req.userId);
    if (!user) {
      return res.status(403).json({ message: "Acceso restringido a creadores aprobados." });
    }

    const creatorId = new mongoose.Types.ObjectId(req.userId);

    const [aggResult, recentGifts] = await Promise.all([
      Gift.aggregate([
        { $match: { receiver: creatorId } },
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
      Gift.find({ receiver: creatorId })
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
    const user = await requireApprovedCreator(req.userId);
    if (!user) {
      return res.status(403).json({ message: "Acceso restringido a creadores aprobados." });
    }

    // Placeholder: payout logic will be implemented in a future update.
    return res.status(200).json({ message: "Solicitud de retiro recibida. Será procesada pronto." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getEarnings, requestPayout };
