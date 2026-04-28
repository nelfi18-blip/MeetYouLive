const mongoose = require("mongoose");
const User = require("../models/User.js");
const Gift = require("../models/Gift.js");
const Live = require("../models/Live.js");

/**
 * GET /api/creators/discovery
 * Public endpoint for discovering creators (Tango-style)
 * Returns only approved creators with public stats
 */
const getCreatorsForDiscovery = async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const maxLimit = Math.min(parseInt(limit, 10) || 20, 50);

    // Find approved creators only (exclude admin/moderator)
    const creators = await User.find({
      role: "creator",
      creatorStatus: "approved",
      username: { $ne: null },
    })
      .select("_id username name avatar isPremium isVerifiedCreator followersCount")
      .limit(maxLimit)
      .lean();

    if (!creators || creators.length === 0) {
      return res.json([]);
    }

    const creatorIds = creators.map((c) => c._id);

    // Get public stats for each creator
    const [giftStats, liveStats, topGiftData] = await Promise.all([
      // Total coins received (all time)
      Gift.aggregate([
        { $match: { receiver: { $in: creatorIds } } },
        {
          $group: {
            _id: "$receiver",
            totalReceivedCoins: { $sum: "$coinCost" },
            giftCount: { $sum: 1 },
          },
        },
      ]),

      // Current live status
      Live.aggregate([
        { $match: { user: { $in: creatorIds }, isLive: true } },
        {
          $group: {
            _id: "$user",
            isLive: { $max: true },
            currentLiveId: { $first: "$_id" },
            viewerCount: { $first: "$viewerCount" },
          },
        },
      ]),

      // Top gift received (highest single gift)
      Gift.aggregate([
        { $match: { receiver: { $in: creatorIds } } },
        { $sort: { coinCost: -1 } },
        {
          $group: {
            _id: "$receiver",
            topGift: { $first: { name: "$name", coinCost: "$coinCost" } },
          },
        },
      ]),
    ]);

    // Build stats map
    const statsMap = new Map();
    giftStats.forEach((stat) => {
      const id = stat._id.toString();
      statsMap.set(id, {
        totalReceivedCoins: stat.totalReceivedCoins || 0,
        giftCount: stat.giftCount || 0,
        superGiftCount: 0, // Will calculate below
      });
    });

    liveStats.forEach((stat) => {
      const id = stat._id.toString();
      const existing = statsMap.get(id) || {};
      statsMap.set(id, {
        ...existing,
        isLive: stat.isLive || false,
        currentLiveId: stat.currentLiveId,
        viewerCount: stat.viewerCount || 0,
      });
    });

    topGiftData.forEach((stat) => {
      const id = stat._id.toString();
      const existing = statsMap.get(id) || {};
      statsMap.set(id, {
        ...existing,
        topGift: stat.topGift || null,
      });
    });

    // Count super gifts (gifts > 500 coins)
    const superGiftCounts = await Gift.aggregate([
      { $match: { receiver: { $in: creatorIds }, coinCost: { $gte: 500 } } },
      { $group: { _id: "$receiver", superGiftCount: { $sum: 1 } } },
    ]);

    superGiftCounts.forEach((stat) => {
      const id = stat._id.toString();
      const existing = statsMap.get(id) || {};
      statsMap.set(id, {
        ...existing,
        superGiftCount: stat.superGiftCount || 0,
      });
    });

    // Count top fans (fans who gifted > 1000 coins)
    const topFanCounts = await Gift.aggregate([
      { $match: { receiver: { $in: creatorIds } } },
      { $group: { _id: { receiver: "$receiver", sender: "$sender" }, totalCoins: { $sum: "$coinCost" } } },
      { $match: { totalCoins: { $gte: 1000 } } },
      { $group: { _id: "$_id.receiver", topFanCount: { $sum: 1 } } },
    ]);

    topFanCounts.forEach((stat) => {
      const id = stat._id.toString();
      const existing = statsMap.get(id) || {};
      statsMap.set(id, {
        ...existing,
        topFanCount: stat.topFanCount || 0,
      });
    });

    // Merge creator data with stats
    const result = creators.map((creator) => {
      const id = creator._id.toString();
      const stats = statsMap.get(id) || {};
      return {
        userId: creator._id,
        username: creator.username,
        name: creator.name,
        avatar: creator.avatar,
        isPremium: creator.isPremium || false,
        isVerifiedCreator: creator.isVerifiedCreator || false,
        followersCount: creator.followersCount || 0,
        // Public stats only
        totalReceivedCoins: stats.totalReceivedCoins || 0,
        giftCount: stats.giftCount || 0,
        superGiftCount: stats.superGiftCount || 0,
        topGift: stats.topGift || null,
        topFanCount: stats.topFanCount || 0,
        // Live status
        isLive: stats.isLive || false,
        currentLiveId: stats.currentLiveId || null,
        viewerCount: stats.viewerCount || 0,
      };
    });

    // Sort by live status first, then by total coins received
    result.sort((a, b) => {
      if (a.isLive && !b.isLive) return -1;
      if (!a.isLive && b.isLive) return 1;
      return (b.totalReceivedCoins || 0) - (a.totalReceivedCoins || 0);
    });

    res.json(result);
  } catch (err) {
    console.error("[creatorDiscovery] Error:", err);
    res.status(500).json({ message: "Error al cargar creadores" });
  }
};

module.exports = {
  getCreatorsForDiscovery,
};
