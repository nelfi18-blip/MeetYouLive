const Gift = require("../models/Gift.js");
const User = require("../models/User.js");

const getEarnings = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("role creatorStatus");
    if (!user || user.role !== "creator" || user.creatorStatus !== "approved") {
      return res.status(403).json({ message: "Acceso restringido a creadores aprobados." });
    }

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

module.exports = { getEarnings };
