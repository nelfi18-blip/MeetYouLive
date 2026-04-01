const Gift = require("../models/Gift.js");

const getEarnings = async (req, res) => {
  try {
    const userId = req.userId;

    const [aggregateResult, recentGifts] = await Promise.all([
      Gift.aggregate([
        { $match: { receiver: userId } },
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
      Gift.find({ receiver: userId })
        .sort({ createdAt: -1 })
        .limit(20)
        .populate("sender", "username name avatar")
        .populate("giftCatalogItem", "name icon"),
    ]);

    const totals = aggregateResult[0] || {
      totalCoinsReceived: 0,
      totalCreatorShare: 0,
      totalPlatformShare: 0,
      totalGiftCount: 0,
    };

    const recentTransactions = recentGifts.map((g) => ({
      _id: g._id,
      sender: g.sender
        ? { username: g.sender.username, name: g.sender.name, avatar: g.sender.avatar }
        : null,
      giftName: g.giftCatalogItem?.name || "Regalo",
      giftIcon: g.giftCatalogItem?.icon || "🎁",
      coinCost: g.coinCost,
      creatorShare: g.creatorShare,
      platformShare: g.platformShare,
      context: g.context,
      createdAt: g.createdAt,
    }));

    res.json({
      totalCoinsReceived: totals.totalCoinsReceived,
      totalCreatorShare: totals.totalCreatorShare,
      totalPlatformShare: totals.totalPlatformShare,
      totalGiftCount: totals.totalGiftCount,
      recentTransactions,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getEarnings };
