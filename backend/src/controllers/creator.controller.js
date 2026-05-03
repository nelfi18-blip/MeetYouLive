const mongoose = require("mongoose");
const Stripe = require("stripe");
const Gift = require("../models/Gift");
const User = require("../models/User");
const Payout = require("../models/Payout");
const Live = require("../models/Live");
const VideoCall = require("../models/VideoCall");
const CoinTransaction = require("../models/CoinTransaction");
const AgencyRelationship = require("../models/AgencyRelationship");
const { computeCreatorProgress } = require("../utils/creatorProgress");

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// Minimum Stripe transfer in cents ($1.00)
const STRIPE_MIN_TRANSFER_CENTS = 100;

const requireApprovedCreatorHelper = async (userId) => {
  const user = await User.findById(userId).select(
    "role creatorStatus username name creatorApprovedAt earningsCoins coins agencyEarningsCoins followersCount"
  );

  if (!user) {
    return { error: "Usuario no encontrado.", user: null };
  }

  // Allow both creator and subCreator roles with approved status
  const isCreator = user.role === "creator" && user.creatorStatus === "approved";
  const isSubCreator = user.role === "subCreator" && user.creatorStatus === "approved";

  if (!isCreator && !isSubCreator) {
    return { error: "Acceso restringido a creadores aprobados.", user: null };
  }

  return { error: null, user };
};

const getConsistencyDays = async (userId, days = 30) => {
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const rows = await Live.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(userId), createdAt: { $gte: start } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } } } },
    { $count: "days" },
  ]).catch(() => []);
  return rows[0]?.days || 0;
};

exports.getCreatorStats = async (req, res) => {
  try {
    const userId = req.userId || req.user?.id;
    const { error, user } = await requireApprovedCreatorHelper(userId);

    if (error) {
      return res.status(403).json({ ok: false, message: error });
    }

    const [aggregateResult, callAgg, liveCount, pendingPayout, consistencyDays] = await Promise.all([
      Gift.aggregate([
        { $match: { receiver: new mongoose.Types.ObjectId(user._id) } },
        {
          $group: {
            _id: null,
            totalCoinsReceived: { $sum: "$coinCost" },
            totalCreatorShare: { $sum: "$creatorShare" },
            totalGiftCount: { $sum: 1 },
          },
        },
      ]),
      VideoCall.aggregate([
        { $match: { recipient: new mongoose.Types.ObjectId(user._id), status: "ended", type: "paid_creator" } },
        {
          $group: {
            _id: null,
            totalCalls: { $sum: 1 },
            totalCallDurationSeconds: { $sum: "$totalDurationSeconds" },
            totalCallEarnings: { $sum: "$creatorShare" },
          },
        },
      ]),
      Live.countDocuments({ user: user._id }).catch(() => 0),
      Payout.findOne({
        creator: user._id,
        status: { $in: ["pending", "approved", "processing"] },
      }).sort({ createdAt: -1 }),
      getConsistencyDays(user._id, 30),
    ]);

    const totals = aggregateResult[0] || {
      totalCoinsReceived: 0,
      totalCreatorShare: 0,
      totalGiftCount: 0,
    };

    const callTotals = callAgg[0] || {
      totalCalls: 0,
      totalCallDurationSeconds: 0,
      totalCallEarnings: 0,
    };

    const creatorLevel = computeCreatorProgress({
      totalCoinsReceived: totals.totalCoinsReceived || 0,
      totalCreatorShare: totals.totalCreatorShare || 0,
      totalGifts: totals.totalGiftCount || 0,
      totalLives: liveCount || 0,
      consistencyDays: consistencyDays || 0,
      followersCount: user.followersCount || 0,
    });

    return res.json({
      ok: true,
      earningsCoins: user.earningsCoins || 0,
      agencyEarningsCoins: user.agencyEarningsCoins || 0,
      coins: user.coins || 0,
      totalLives: liveCount,
      totalGifts: totals.totalGiftCount || 0,
      totalCoinsReceived: totals.totalCoinsReceived || 0,
      totalCreatorShare: totals.totalCreatorShare || 0,
      totalCalls: callTotals.totalCalls || 0,
      totalCallDurationSeconds: callTotals.totalCallDurationSeconds || 0,
      totalCallEarnings: callTotals.totalCallEarnings || 0,
      consistencyDays: consistencyDays || 0,
      creatorLevel,
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
    const { error, user } = await requireApprovedCreatorHelper(userId);

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

    const [recentTransactions, payoutRows, payoutAgg, callAgg] = await Promise.all([
      Gift.find({ receiver: user._id })
        .populate("sender", "username name avatar")
        .populate("giftCatalogItem")
        .sort({ createdAt: -1 })
        .limit(20),
      Payout.find({ creator: user._id })
        .sort({ createdAt: -1 })
        .limit(10),
      Payout.aggregate([
        { $match: { creator: new mongoose.Types.ObjectId(user._id) } },
        {
          $group: {
            _id: null,
            pendingCoins: {
              $sum: {
                $cond: [{ $in: ["$status", ["pending", "approved", "processing"]] }, "$amountCoins", 0],
              },
            },
            withdrawnCoins: {
              $sum: {
                $cond: [{ $in: ["$status", ["completed", "paid"]] }, "$amountCoins", 0],
              },
            },
          },
        },
      ]),
      VideoCall.aggregate([
        { $match: { recipient: new mongoose.Types.ObjectId(user._id), status: "ended", type: "paid_creator" } },
        {
          $group: {
            _id: null,
            totalCallEarnings: { $sum: "$creatorShare" },
          },
        },
      ]),
    ]);

    const totals = aggregateResult[0] || {
      totalCoinsReceived: 0,
      totalCreatorShare: 0,
      totalPlatformShare: 0,
      totalGiftCount: 0,
    };

    const callTotals = callAgg[0] || { totalCallEarnings: 0 };
    const payoutTotals = payoutAgg[0] || { pendingCoins: 0, withdrawnCoins: 0 };
    const recentMonetizationActivity = [
      ...recentTransactions.map((tx) => ({
        _id: `gift-${tx._id}`,
        type: "gift",
        label: `${tx.giftIcon || "🎁"} ${tx.giftName || "Regalo"} recibido`,
        amountCoins: tx.creatorShare || 0,
        status: "credited",
        createdAt: tx.createdAt,
      })),
      ...payoutRows.map((p) => ({
        _id: `payout-${p._id}`,
        type: "payout",
        label: "Solicitud de retiro",
        amountCoins: p.amountCoins || 0,
        status: p.status,
        createdAt: p.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 20);

    return res.json({
      ok: true,
      totalCoinsReceived: totals.totalCoinsReceived,
      totalCreatorShare: totals.totalCreatorShare,
      totalPlatformShare: totals.totalPlatformShare,
      totalGiftCount: totals.totalGiftCount,
      pendingPayoutCoins: payoutTotals.pendingCoins || 0,
      withdrawnCoins: payoutTotals.withdrawnCoins || 0,
      totalEarnedLifetime:
        (totals.totalCreatorShare || 0) + (callTotals.totalCallEarnings || 0),
      availableForPayoutCoins: user.earningsCoins || 0,
      recentTransactions,
      recentMonetizationActivity,
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
    const { error, user } = await requireApprovedCreatorHelper(userId);

    if (error) {
      return res.status(403).json({ ok: false, message: error });
    }

    const { method = "stripe", paymentDetails = "" } = req.body;

    const MIN_PAYOUT_COINS = 100;
    // 1 coin = $0.10 USD
    const COINS_PER_USD = 10;
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
      status: { $in: ["pending", "approved"] },
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

    // Reserve coins atomically
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

    // Calculate USD amount
    const amountUsd = available / COINS_PER_USD;

    const payout = await Payout.create({
      creator: user._id,
      amountCoins: available,
      amountUsd,
      method,
      paymentDetails,
      status: "pending",
      requestedAt: new Date(),
      notes: `Solicitud creada desde creator dashboard. Método: ${method}`,
    });

    return res.json({
      ok: true,
      message: "Solicitud de retiro registrada correctamente.",
      payout: {
        _id: payout._id,
        amountCoins: payout.amountCoins,
        amountUsd: payout.amountUsd,
        method: payout.method,
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

// GET /api/creator/payout-history — paginated payout history for the authenticated creator
exports.getPayoutHistory = async (req, res) => {
  try {
    const userId = req.userId || req.user?.id;
    const { error, user } = await requireApprovedCreatorHelper(userId);
    if (error) {
      return res.status(403).json({ ok: false, message: error });
    }

    const MAX_PAYOUT_HISTORY_LIMIT = 50;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MAX_PAYOUT_HISTORY_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [payouts, total] = await Promise.all([
      Payout.find({ creator: user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Payout.countDocuments({ creator: user._id }),
    ]);

    return res.json({
      ok: true,
      payouts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("getPayoutHistory error:", err);
    return res.status(500).json({ ok: false, message: "Error interno del servidor" });
  }
};

// GET /api/creator/dashboard — consolidated creator dashboard data (approved creators only)
exports.getCreatorDashboard = async (req, res) => {
  try {
    const userId = req.userId || req.user?.id;
    const { error, user } = await requireApprovedCreatorHelper(userId);

    if (error) {
      return res.status(403).json({ ok: false, message: error });
    }

    // Calculate start of today (UTC)
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const [
      giftAgg,
      callAgg,
      activeLive,
      pendingPayout,
      liveCount,
      consistencyDays,
      payoutAgg,
      todayEarningsAgg,
      topSupporterAgg,
      agencyRelationships,
      subCreatorEarnings,
    ] = await Promise.all([
      // Total gift earnings
      Gift.aggregate([
        { $match: { receiver: new mongoose.Types.ObjectId(user._id) } },
        {
          $group: {
            _id: null,
            totalCoinsReceived: { $sum: "$coinCost" },
            totalCreatorShare: { $sum: "$creatorShare" },
            totalGiftCount: { $sum: 1 },
          },
        },
      ]),
      // Total call earnings
      VideoCall.aggregate([
        { $match: { recipient: new mongoose.Types.ObjectId(user._id), status: "ended", type: "paid_creator" } },
        {
          $group: {
            _id: null,
            totalCalls: { $sum: 1 },
            totalCallDurationSeconds: { $sum: "$totalDurationSeconds" },
            totalCallEarnings: { $sum: "$creatorShare" },
          },
        },
      ]),
      // Active live
      Live.findOne({ user: user._id, isLive: true }).select(
        "_id title viewerCount chatEnabled giftsEnabled isPrivate entryCost"
      ),
      // Pending payout
      Payout.findOne({
        creator: user._id,
        status: { $in: ["pending", "approved", "processing"] },
      }).sort({ createdAt: -1 }),
      // Total lives count
      Live.countDocuments({ user: user._id }).catch(() => 0),
      // Consistency days
      getConsistencyDays(user._id, 30),
      // Payout aggregation
      Payout.aggregate([
        { $match: { creator: new mongoose.Types.ObjectId(user._id) } },
        {
          $group: {
            _id: null,
            pendingCoins: {
              $sum: {
                $cond: [{ $in: ["$status", ["pending", "approved", "processing"]] }, "$amountCoins", 0],
              },
            },
            withdrawnCoins: {
              $sum: {
                $cond: [{ $in: ["$status", ["completed", "paid"]] }, "$amountCoins", 0],
              },
            },
          },
        },
      ]),
      // Today's earnings from CoinTransaction
      CoinTransaction.aggregate([
        {
          $match: {
            userId: new mongoose.Types.ObjectId(user._id),
            type: { $in: ["gift_received", "call_earned", "content_earned", "agency_earned"] },
            status: "completed",
            createdAt: { $gte: todayStart },
          },
        },
        {
          $group: {
            _id: null,
            todayEarnings: { $sum: "$amount" },
          },
        },
      ]),
      // Top supporter from all lives
      Gift.aggregate([
        { $match: { receiver: new mongoose.Types.ObjectId(user._id) } },
        {
          $group: {
            _id: "$sender",
            totalCoins: { $sum: "$coinCost" },
          },
        },
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
            userId: "$_id",
            username: "$senderInfo.username",
            name: "$senderInfo.name",
            totalCoins: 1,
          },
        },
      ]),
      // Agency relationships (if creator is a parent)
      AgencyRelationship.find({
        parentCreator: user._id,
        status: "active",
        subCreatorAgreed: true,
      }).select("subCreator percentage"),
      // Sub-creator earnings from agency_earned transactions
      CoinTransaction.aggregate([
        {
          $match: {
            userId: new mongoose.Types.ObjectId(user._id),
            type: "agency_earned",
            status: "completed",
          },
        },
        {
          $group: {
            _id: null,
            totalAgencyEarned: { $sum: "$amount" },
          },
        },
      ]),
    ]);

    const totals = giftAgg[0] || {
      totalCoinsReceived: 0,
      totalCreatorShare: 0,
      totalGiftCount: 0,
    };

    const callTotals = callAgg[0] || {
      totalCalls: 0,
      totalCallDurationSeconds: 0,
      totalCallEarnings: 0,
    };

    const pendingCoins = payoutAgg[0]?.pendingCoins || 0;
    const withdrawnCoins = payoutAgg[0]?.withdrawnCoins || 0;
    
    // Today's earnings
    const todayEarnings = todayEarningsAgg[0]?.todayEarnings || 0;

    // Total earnings (from creator shares + call earnings)
    const totalEarnings = (totals.totalCreatorShare || 0) + (callTotals.totalCallEarnings || 0);

    // Top supporter
    const topSupporter = topSupporterAgg[0]
      ? {
          username: topSupporterAgg[0].username || topSupporterAgg[0].name || "Usuario",
          totalCoins: topSupporterAgg[0].totalCoins || 0,
        }
      : null;

    // Average earnings per live
    const avgEarningsPerLive = liveCount > 0 ? Math.floor(totalEarnings / liveCount) : 0;

    // Agency metrics (if user has sub-creators)
    let agencyMetrics = null;
    if (agencyRelationships && agencyRelationships.length > 0) {
      const totalSubCreators = agencyRelationships.length;
      const commissionEarned = subCreatorEarnings[0]?.totalAgencyEarned || 0;
      
      agencyMetrics = {
        totalSubCreators,
        commissionEarned,
      };
    }

    const creatorLevel = computeCreatorProgress({
      totalCoinsReceived: totals.totalCoinsReceived || 0,
      totalCreatorShare: totals.totalCreatorShare || 0,
      totalGifts: totals.totalGiftCount || 0,
      totalLives: liveCount || 0,
      consistencyDays: consistencyDays || 0,
      followersCount: user.followersCount || 0,
    });

    return res.json({
      ok: true,
      activeLive: activeLive || null,
      earningsCoins: user.earningsCoins || 0,
      agencyEarningsCoins: user.agencyEarningsCoins || 0,
      coins: user.coins || 0,
      totalGifts: totals.totalGiftCount || 0,
      totalLives: liveCount || 0,
      totalCoinsReceived: totals.totalCoinsReceived || 0,
      totalCreatorShare: totals.totalCreatorShare || 0,
      totalCalls: callTotals.totalCalls || 0,
      totalCallDurationSeconds: callTotals.totalCallDurationSeconds || 0,
      totalCallEarnings: callTotals.totalCallEarnings || 0,
      consistencyDays: consistencyDays || 0,
      pendingPayoutCoins: pendingCoins,
      withdrawnCoins,
      totalEarnedLifetime: totalEarnings,
      creatorLevel,
      pendingPayout: pendingPayout
        ? {
            _id: pendingPayout._id,
            amountCoins: pendingPayout.amountCoins,
            status: pendingPayout.status,
            createdAt: pendingPayout.createdAt,
          }
        : null,
      // New metrics for Creator Earnings Dashboard
      todayEarnings,
      totalEarnings,
      totalGiftsReceived: totals.totalGiftCount || 0,
      topSupporter,
      avgEarningsPerLive,
      agencyMetrics,
    });
  } catch (err) {
    console.error("getCreatorDashboard error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Error interno del servidor" });
  }
};

// POST /api/creator/request — submit a creator access request (normal users only)
exports.submitCreatorRequest = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ ok: false, message: "Usuario no encontrado" });

    if (user.role !== "user") {
      return res.status(400).json({ ok: false, message: "Solo los usuarios normales pueden solicitar ser creadores" });
    }

    if (user.creatorStatus === "pending") {
      return res.status(400).json({ ok: false, message: "Ya tienes una solicitud de creador pendiente" });
    }

    if (user.creatorStatus === "approved") {
      return res.status(400).json({ ok: false, message: "Ya eres un creador aprobado" });
    }

    const { displayName, bio, category, country, languages, socialLinks, agencyCode, creatorInvite } = req.body;

    if (!displayName || !displayName.trim()) {
      return res.status(400).json({ ok: false, message: "El nombre de creador es requerido" });
    }
    if (!bio || !bio.trim()) {
      return res.status(400).json({ ok: false, message: "La biografía es requerida" });
    }
    if (!category || !category.trim()) {
      return res.status(400).json({ ok: false, message: "La categoría es requerida" });
    }
    if (!country || !country.trim()) {
      return res.status(400).json({ ok: false, message: "El país es requerido" });
    }
    if (!languages || !Array.isArray(languages) || languages.length === 0) {
      return res.status(400).json({ ok: false, message: "Debes seleccionar al menos un idioma" });
    }

    const filteredLanguages = languages.filter((l) => l && l.trim());
    if (filteredLanguages.length === 0) {
      return res.status(400).json({ ok: false, message: "Debes seleccionar al menos un idioma válido" });
    }

    const sanitizedSocialLinks = {
      twitter: (socialLinks?.twitter || "").trim(),
      instagram: (socialLinks?.instagram || "").trim(),
      tiktok: (socialLinks?.tiktok || "").trim(),
      youtube: (socialLinks?.youtube || "").trim(),
    };

    user.creatorApplication = {
      displayName: displayName.trim(),
      bio: bio.trim(),
      category: category.trim(),
      country: country.trim(),
      languages: filteredLanguages.map((l) => l.trim()),
      socialLinks: sanitizedSocialLinks,
      submittedAt: new Date(),
    };
    user.creatorStatus = "pending";

    // Accept an agency invite code submitted with the creator request — override any code
    // stored at registration time so the most recent intent wins.
    if (agencyCode) {
      const safeCode = String(agencyCode).trim().toUpperCase();
      const agencyOwner = await User.findOne({
        "agencyProfile.agencyCode": safeCode,
        role: "creator",
        creatorStatus: "approved",
      }).select("_id").lean();
      if (agencyOwner) {
        user.pendingAgencyCode = safeCode;
      }
      // Silently ignore invalid codes
    }

    // If creator invite code is provided, validate it and set invitedByCreator + role to subCreator
    let invitedByCreator = user.invitedByCreator || null;
    if (creatorInvite && !invitedByCreator) {
      const safeInviteCode = String(creatorInvite).trim().toUpperCase();
      const inviterCreator = await User.findOne({
        creatorInviteCode: safeInviteCode,
        role: "creator",
        creatorStatus: "approved",
      }).select("_id");
      if (inviterCreator) {
        invitedByCreator = inviterCreator._id;
        user.invitedByCreator = invitedByCreator;
        user.role = "subCreator"; // Set role to subCreator
      }
      // Silently ignore invalid codes
    }

    await user.save();

    return res.json({
      ok: true,
      message: "Solicitud enviada correctamente. Un administrador la revisará pronto.",
      creatorStatus: user.creatorStatus,
    });
  } catch (err) {
    console.error("submitCreatorRequest error:", err);
    return res.status(500).json({ ok: false, message: "Error interno del servidor" });
  }
};

// GET /api/creator/request-status — get current user's creator request status
exports.getCreatorRequestStatus = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select(
      "role creatorStatus creatorApplication creatorApprovedAt"
    );
    if (!user) return res.status(404).json({ ok: false, message: "Usuario no encontrado" });

    return res.json({
      ok: true,
      role: user.role,
      creatorStatus: user.creatorStatus,
      submittedAt: user.creatorApplication?.submittedAt || null,
      approvedAt: user.creatorApprovedAt || null,
    });
  } catch (err) {
    console.error("getCreatorRequestStatus error:", err);
    return res.status(500).json({ ok: false, message: "Error interno del servidor" });
  }
};

// ── Stripe Connect ─────────────────────────────────────────────────────────

/**
 * POST /api/creator/payout/connect-onboarding
 * Creates a Stripe Connect Express account (if the creator doesn't have one yet)
 * and returns an onboarding URL so the creator can set up their payout details.
 */
exports.connectOnboarding = async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ ok: false, message: "Pagos no configurados en este entorno." });
    }

    const userId = req.userId || req.user?.id;
    const { error, user } = await requireApprovedCreatorHelper(userId);
    if (error) return res.status(403).json({ ok: false, message: error });

    let fullUser = await User.findById(user._id).select("email stripeAccountId stripeAccountStatus");
    if (!fullUser) return res.status(404).json({ ok: false, message: "Usuario no encontrado" });

    let accountId = fullUser.stripeAccountId;

    if (!accountId) {
      // Create a new Stripe Express connected account
      const account = await stripe.accounts.create({
        type: "express",
        email: fullUser.email,
        capabilities: { transfers: { requested: true } },
        metadata: { userId: String(user._id) },
      });
      accountId = account.id;
      await User.findByIdAndUpdate(user._id, {
        stripeAccountId: accountId,
        stripeAccountStatus: "pending",
      });
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${process.env.FRONTEND_URL}/creator/payout?connect=refresh`,
      return_url: `${process.env.FRONTEND_URL}/creator/payout?connect=success`,
      type: "account_onboarding",
    });

    res.json({ ok: true, url: accountLink.url });
  } catch (err) {
    console.error("connectOnboarding error:", err);
    res.status(500).json({ ok: false, message: "Error al iniciar el proceso de vinculación con Stripe." });
  }
};

/**
 * GET /api/creator/payout/connect-status
 * Returns whether the creator's Stripe Connect account is fully onboarded.
 */
exports.getConnectStatus = async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ ok: false, message: "Pagos no configurados en este entorno." });
    }

    const userId = req.userId || req.user?.id;
    const { error, user } = await requireApprovedCreatorHelper(userId);
    if (error) return res.status(403).json({ ok: false, message: error });

    const fullUser = await User.findById(user._id).select("stripeAccountId stripeAccountStatus").lean();
    if (!fullUser?.stripeAccountId) {
      return res.json({ ok: true, connected: false, status: null });
    }

    // Refresh status from Stripe (live check)
    const account = await stripe.accounts.retrieve(fullUser.stripeAccountId);
    const enabled = account.charges_enabled && account.payouts_enabled;
    const newStatus = enabled ? "enabled" : account.requirements?.currently_due?.length > 0 ? "restricted" : "pending";

    if (newStatus !== fullUser.stripeAccountStatus) {
      await User.findByIdAndUpdate(user._id, { stripeAccountStatus: newStatus });
    }

    res.json({ ok: true, connected: enabled, status: newStatus, accountId: fullUser.stripeAccountId });
  } catch (err) {
    console.error("getConnectStatus error:", err);
    res.status(500).json({ ok: false, message: "Error al verificar el estado de la cuenta de Stripe." });
  }
};

// Get creator's invite code for viral growth
exports.getCreatorInviteCode = async (req, res) => {
  try {
    const userId = req.userId || req.user?.id;
    const { error, user } = await requireApprovedCreatorHelper(userId);

    if (error) {
      return res.status(403).json({ ok: false, message: error });
    }

    const fullUser = await User.findById(userId).select("creatorInviteCode");
    if (!fullUser.creatorInviteCode) {
      return res.json({
        ok: true,
        code: null,
        message: "No tienes código de invitación asignado aún. Contacta al soporte.",
      });
    }

    res.json({
      ok: true,
      code: fullUser.creatorInviteCode,
      inviteUrl: `${process.env.FRONTEND_URL || "https://meetyoulive.vercel.app"}/creator-request?creatorInvite=${fullUser.creatorInviteCode}`,
    });
  } catch (error) {
    console.error("[getCreatorInviteCode] Error:", error);
    res.status(500).json({ ok: false, message: error.message });
  }
};
