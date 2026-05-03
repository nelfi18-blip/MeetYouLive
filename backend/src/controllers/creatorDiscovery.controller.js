const mongoose = require("mongoose");
const User = require("../models/User.js");
const Gift = require("../models/Gift.js");
const Live = require("../models/Live.js");
const { isLiveActuallyActive } = require("../services/live.service.js");

/**
 * GET /api/creators/discovery
 * Public endpoint for discovering creators (Tango-style)
 * Returns only approved creators with public stats
 */
const getCreatorsForDiscovery = async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const maxLimit = Math.min(parseInt(limit, 10) || 20, 50);

    // Find approved creators only (both creator and subCreator roles, exclude admin/moderator)
    // Sort by followersCount to get most popular creators deterministically
    const creators = await User.find({
      role: { $in: ["creator", "subCreator"] },
      creatorStatus: "approved",
      username: { $ne: null },
    })
      .select("_id username name avatar isPremium isVerifiedCreator followersCount")
      .sort({ followersCount: -1, _id: 1 }) // Deterministic sorting
      .limit(maxLimit * 2) // Get more than needed for filtering
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

      // Current live status - fetch live docs with validation fields
      Live.find({ user: { $in: creatorIds }, isLive: true })
        .select("user _id viewerCount createdAt endedAt isLive")
        .lean(),

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

    // Filter and process live stats to include only actually active lives
    liveStats.forEach((live) => {
      // Validate live is actually active (not stale)
      if (!isLiveActuallyActive(live)) {
        return; // Skip stale lives
      }
      
      const id = live.user.toString();
      const existing = statsMap.get(id) || {};
      statsMap.set(id, {
        ...existing,
        isLive: true,
        currentLiveId: live._id,
        viewerCount: live.viewerCount || 0,
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

    // Limit to requested amount after sorting
    const finalResult = result.slice(0, maxLimit);

    res.json(finalResult);
  } catch (err) {
    console.error("[creatorDiscovery] Error:", err);
    res.status(500).json({ message: "Error al cargar creadores" });
  }
};

module.exports = {
  getCreatorsForDiscovery,
};
