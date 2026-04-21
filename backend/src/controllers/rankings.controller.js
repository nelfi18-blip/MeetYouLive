const mongoose = require("mongoose");
const Gift = require("../models/Gift.js");
const Live = require("../models/Live.js");
const User = require("../models/User.js");
const { hasLiveHost } = require("../lib/socket.js");

const getTodayStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const getWeekStart = () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  d.setHours(0, 0, 0, 0);
  return d;
};

// GET /api/rankings/live/:id/top-gifters
// Top 3 gifters for a specific live stream (public)
const getLiveTopGifters = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID de directo inválido" });
    }
    const liveId = new mongoose.Types.ObjectId(id);

    const topGifters = await Gift.aggregate([
      { $match: { live: liveId } },
      { $group: { _id: "$sender", totalCoins: { $sum: "$coinCost" } } },
      { $sort: { totalCoins: -1 } },
      { $limit: 3 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "senderInfo",
        },
      },
      { $unwind: { path: "$senderInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          userId: "$_id",
          totalCoins: 1,
          username: "$senderInfo.username",
          name: "$senderInfo.name",
          isPremium: "$senderInfo.isPremium",
        },
      },
    ]);

    res.json(topGifters);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/rankings/creators?period=today|week|alltime&type=gifted|viewed
// Top 10 creators by coins received or views (public)
const getTopCreators = async (req, res) => {
  try {
    const { period = "week", type = "gifted" } = req.query;

    const startDate =
      period === "today"
        ? getTodayStart()
        : period === "week"
        ? getWeekStart()
        : null;

    if (type === "viewed") {
      const dateFilter = startDate ? { $match: { createdAt: { $gte: startDate } } } : { $match: {} };
      const topCreators = await Live.aggregate([
        dateFilter,
        { $group: { _id: "$user", totalViews: { $sum: "$viewerCount" } } },
        { $sort: { totalViews: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "u",
          },
        },
        { $unwind: { path: "$u", preserveNullAndEmptyArrays: true } },
        {
          $match: {
            "u.role": "creator",
            "u.creatorStatus": "approved",
            "u.username": { $ne: null },
          },
        },
        {
          $project: {
            _id: 0,
            userId: "$_id",
            totalViews: 1,
            username: "$u.username",
            name: "$u.name",
            isPremium: "$u.isPremium",
            isVerifiedCreator: "$u.isVerifiedCreator",
          },
        },
      ]);
      return res.json(topCreators);
    }

    // type === "gifted"
    const matchQuery = startDate ? { createdAt: { $gte: startDate } } : {};
    const topCreators = await Gift.aggregate([
      { $match: matchQuery },
      { $group: { _id: "$receiver", totalCoins: { $sum: "$coinCost" } } },
      { $sort: { totalCoins: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "u",
        },
      },
      { $unwind: { path: "$u", preserveNullAndEmptyArrays: true } },
      {
        $match: {
          "u.role": "creator",
          "u.creatorStatus": "approved",
          "u.username": { $ne: null },
        },
      },
      {
        $project: {
          _id: 0,
          userId: "$_id",
          totalCoins: 1,
          username: "$u.username",
          name: "$u.name",
          isPremium: "$u.isPremium",
          isVerifiedCreator: "$u.isVerifiedCreator",
        },
      },
    ]);

    res.json(topCreators);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/rankings/featured
// Featured creators: live now + top today + top this week (public)
const getFeaturedCreators = async (req, res) => {
  try {
    const todayStart = getTodayStart();
    const weekStart = getWeekStart();

    const giftTopPipeline = (startDate) => [
      { $match: { createdAt: { $gte: startDate } } },
      { $group: { _id: "$receiver", totalCoins: { $sum: "$coinCost" } } },
      { $sort: { totalCoins: -1 } },
      { $limit: 6 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "u",
        },
      },
      { $unwind: { path: "$u", preserveNullAndEmptyArrays: true } },
      {
        $match: {
          "u.role": "creator",
          "u.creatorStatus": "approved",
          "u.username": { $ne: null },
        },
      },
      {
        $project: {
          _id: 0,
          userId: "$_id",
          totalCoins: 1,
          username: "$u.username",
          name: "$u.name",
          isPremium: "$u.isPremium",
          isVerifiedCreator: "$u.isVerifiedCreator",
        },
      },
    ];

    const [liveNowRaw, topToday, topWeek] = await Promise.all([
      Live.find({ isLive: true })
        .populate("user", "username name isPremium isVerifiedCreator")
        .select("_id title viewerCount isPrivate entryCost user createdAt")
        .sort({ viewerCount: -1 })
        .limit(6)
        .lean(),
      Gift.aggregate(giftTopPipeline(todayStart)),
      Gift.aggregate(giftTopPipeline(weekStart)),
    ]);

    const liveNow = (Array.isArray(liveNowRaw) ? liveNowRaw : [])
      .filter((live) => live && live._id && hasLiveHost(String(live._id)));

    res.json({ liveNow, topToday, topWeek });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/rankings/my-stats  (auth required — creators only)
// Returns this creator's ranking position, today's coins, and top fan today
const getCreatorRankingStats = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select(
      "role creatorStatus"
    );
    if (!user || user.role !== "creator" || user.creatorStatus !== "approved") {
      return res.status(403).json({ message: "Acceso restringido a creadores aprobados." });
    }

    const todayStart = getTodayStart();
    const weekStart = getWeekStart();
    const userId = user._id;

    const [todayAgg, topFanAgg, weekRankAgg] = await Promise.all([
      Gift.aggregate([
        { $match: { receiver: userId, createdAt: { $gte: todayStart } } },
        { $group: { _id: null, todayCoins: { $sum: "$coinCost" } } },
      ]),
      Gift.aggregate([
        { $match: { receiver: userId, createdAt: { $gte: todayStart } } },
        { $group: { _id: "$sender", totalCoins: { $sum: "$coinCost" } } },
        { $sort: { totalCoins: -1 } },
        { $limit: 1 },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "senderInfo",
          },
        },
        { $unwind: { path: "$senderInfo", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            userId: "$_id",
            totalCoins: 1,
            username: "$senderInfo.username",
            name: "$senderInfo.name",
          },
        },
      ]),
      // All approved creators ranked by coins this week
      Gift.aggregate([
        { $match: { createdAt: { $gte: weekStart } } },
        { $group: { _id: "$receiver", weekCoins: { $sum: "$coinCost" } } },
        { $sort: { weekCoins: -1 } },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "u",
          },
        },
        { $unwind: { path: "$u", preserveNullAndEmptyArrays: true } },
        {
          $match: { "u.role": "creator", "u.creatorStatus": "approved" },
        },
        { $project: { _id: 1, weekCoins: 1 } },
      ]),
    ]);

    const todayCoins = todayAgg[0]?.todayCoins || 0;
    const topFanToday = topFanAgg[0] || null;
    const rankWeek =
      weekRankAgg.findIndex((r) => r._id.toString() === userId.toString()) + 1;

    res.json({
      todayCoins,
      topFanToday,
      rankWeek: rankWeek > 0 ? rankWeek : null,
      totalRanked: weekRankAgg.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getLiveTopGifters,
  getTopCreators,
  getFeaturedCreators,
  getCreatorRankingStats,
};
