const User = require("../models/User.js");
const Live = require("../models/Live.js");
const Report = require("../models/Report.js");
const Subscription = require("../models/Subscription.js");
const CoinTransaction = require("../models/CoinTransaction.js");
const Gift = require("../models/Gift.js");
const Payout = require("../models/Payout.js");
const AgencyRelationship = require("../models/AgencyRelationship.js");
const mongoose = require("mongoose");

const PLATFORM_EARNINGS_RATE = 0.4;
 * Retries up to MAX_ATTEMPTS times to ensure uniqueness. */
async function generateUniqueAgencyCode(user) {
  const MAX_ATTEMPTS = 10;
  const base = ((user.username || user.name || "AGY").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 5)) || "AGY";
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const suffix = Math.floor(1000 + Math.random() * 9000);
    const code = base + suffix;
    const exists = await User.exists({ "agencyProfile.agencyCode": code });
    if (!exists) return code;
  }
  // Fallback: timestamp-based suffix guaranteed to be unique enough
  return base + Date.now().toString(36).toUpperCase().slice(-5);
}

const ALLOWED_CREATOR_STATUSES = ["pending", "approved", "rejected", "suspended"];
const DEFAULT_CREATOR_STATUSES = ["pending", "approved", "suspended"];
const MAX_REVIEW_NOTE_LENGTH = 300;

exports.getOverview = async (req, res) => {
  try {
    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeUsersToday,
      totalCreators,
      pendingCreators,
      suspendedCreators,
      activeLives,
      totalLives,
      openReports,
      subscriptions,
      totalCoinsResult,
      totalGiftsSentResult,
      payoutsByStatusResult,
      recentRegistrations,
      activeAgencies,
      activeAgencyLinks,
      agencyCommissionResult,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ lastActiveAt: { $gte: oneDayAgo } }),
      User.countDocuments({ role: "creator", creatorStatus: "approved" }),
      User.countDocuments({ creatorStatus: "pending" }),
      User.countDocuments({ creatorStatus: "suspended" }),
      Live.countDocuments({ isLive: true }),
      Live.countDocuments(),
      Report.countDocuments({ status: "pending" }),
      Subscription.countDocuments({ status: "active" }),
      CoinTransaction.aggregate([
        { $match: { type: "purchase", status: "completed" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Gift.aggregate([
        { $group: { _id: null, total: { $sum: "$coinCost" }, count: { $sum: 1 } } },
      ]),
      Payout.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 }, totalCoins: { $sum: "$amountCoins" } } },
      ]),
      User.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      User.countDocuments({ "agencyProfile.enabled": true }),
      AgencyRelationship.countDocuments({ status: "active" }),
      CoinTransaction.aggregate([
        { $match: { type: "agency_earned" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
    ]);

    const totalCoinsPurchased = totalCoinsResult[0]?.total ?? 0;
    const totalGiftsSent = totalGiftsSentResult[0]?.count ?? 0;
    const totalGiftsCoins = totalGiftsSentResult[0]?.total ?? 0;
    const totalAgencyCommissionCoins = agencyCommissionResult[0]?.total ?? 0;

    // Build payout stats from aggregation by status
    const payoutStatusMap = {};
    for (const row of payoutsByStatusResult) {
      payoutStatusMap[row._id] = { count: row.count, totalCoins: row.totalCoins };
    }
    const pendingPayoutsCount = payoutStatusMap["pending"]?.count ?? 0;
    const pendingPayoutsCoins = payoutStatusMap["pending"]?.totalCoins ?? 0;
    const approvedPayoutsCount = payoutStatusMap["approved"]?.count ?? 0;
    const approvedPayoutsCoins = payoutStatusMap["approved"]?.totalCoins ?? 0;
    const processingPayoutsCount = payoutStatusMap["processing"]?.count ?? 0;
    const paidPayoutsCount = (payoutStatusMap["paid"]?.count ?? 0) + (payoutStatusMap["completed"]?.count ?? 0);
    const paidPayoutsCoins = (payoutStatusMap["paid"]?.totalCoins ?? 0) + (payoutStatusMap["completed"]?.totalCoins ?? 0);
    const completedPayoutsCount = payoutStatusMap["completed"]?.count ?? 0;
    const completedPayoutsCoins = payoutStatusMap["completed"]?.totalCoins ?? 0;
    const rejectedPayoutsCount = payoutStatusMap["rejected"]?.count ?? 0;
    const totalPayoutRequests =
      pendingPayoutsCount + approvedPayoutsCount + processingPayoutsCount + completedPayoutsCount + rejectedPayoutsCount +
      (payoutStatusMap["paid"]?.count ?? 0);

    // Platform earns an estimated 40% of all gifted coins
    const platformEarningsEstimatedCoins = Math.round(totalGiftsCoins * PLATFORM_EARNINGS_RATE);

    return res.json({
      ok: true,
      stats: {
        totalUsers,
        activeUsersToday,
        totalCreators,
        pendingCreators,
        suspendedCreators,
        activeLives,
        totalLives,
        openReports,
        subscriptions,
        totalCoinsPurchased,
        totalGiftsSent,
        totalGiftsCoins,
        pendingPayoutsCoins,
        pendingPayoutsCount,
        approvedPayoutsCount,
        approvedPayoutsCoins,
        processingPayoutsCount,
        paidPayoutsCount,
        paidPayoutsCoins,
        completedPayoutsCount,
        completedPayoutsCoins,
        rejectedPayoutsCount,
        totalPayoutRequests,
        platformEarningsEstimatedCoins,
        recentRegistrations,
        activeAgencies,
        activeAgencyLinks,
        totalAgencyCommissionCoins,
      },
    });
  } catch (error) {
    console.error("Admin overview error:", error);
    return res.status(500).json({ ok: false, message: "Error obteniendo resumen admin" });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const { search, role, status, page: pageQ, limit: limitQ } = req.query;
    const page = Math.max(1, parseInt(pageQ) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(limitQ) || 50));
    const skip = (page - 1) * limit;

    const ALLOWED_ROLES = ["user", "creator", "admin"];
    const filter = {};
    if (role && ALLOWED_ROLES.includes(role)) filter.role = role;
    if (status === "blocked") filter.isBlocked = true;
    if (status === "active") filter.isBlocked = { $ne: true };
    if (status === "premium") filter.isPremium = true;
    if (status === "verified") filter.isVerified = true;
    if (search) {
      // Escape regex special characters to prevent ReDoS
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { username: { $regex: safeSearch, $options: "i" } },
        { name: { $regex: safeSearch, $options: "i" } },
        { email: { $regex: safeSearch, $options: "i" } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter, "-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    return res.json({ ok: true, users, total, page, limit });
  } catch (error) {
    console.error("Admin users error:", error);
    return res.status(500).json({ ok: false, message: "Error obteniendo usuarios" });
  }
};

exports.getReports = async (req, res) => {
  try {
    const ALLOWED_STATUSES = ["pending", "reviewed", "dismissed"];
    const filter = {};
    if (req.query.status && ALLOWED_STATUSES.includes(req.query.status)) {
      filter.status = req.query.status;
    }
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const [reports, total] = await Promise.all([
      Report.find(filter)
        .populate("reporter", "username name avatar")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Report.countDocuments(filter),
    ]);

    return res.json({ ok: true, reports, total, page, limit });
  } catch (error) {
    console.error("Admin reports error:", error);
    return res.status(500).json({ ok: false, message: "Error obteniendo reportes" });
  }
};

exports.makeAdmin = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ ok: false, message: "userId es requerido" });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { role: "admin" },
      { new: true, select: "-password" }
    );

    if (!user) {
      return res.status(404).json({ ok: false, message: "Usuario no encontrado" });
    }

    return res.json({ ok: true, user });
  } catch (error) {
    console.error("Make admin error:", error);
    return res.status(500).json({ ok: false, message: "Error actualizando usuario" });
  }
};

exports.getCreatorRequests = async (req, res) => {
  try {
    const requestedStatus = req.query.status;
    // Validate against whitelist before using in query to prevent injection
    const statusFilter = requestedStatus && ALLOWED_CREATOR_STATUSES.includes(requestedStatus)
      ? requestedStatus
      : null;

    // Default view excludes "rejected" since those are resolved; pass ?status=rejected to view them
    const query = statusFilter
      ? { creatorStatus: statusFilter }
      : { creatorStatus: { $in: DEFAULT_CREATOR_STATUSES } };

    const requests = await User.find(query, "-password")
      .sort({ "creatorApplication.submittedAt": -1, createdAt: -1 })
      .limit(200);
    return res.json({ ok: true, requests });
  } catch (error) {
    console.error("Creator requests error:", error);
    return res.status(500).json({ ok: false, message: "Error obteniendo solicitudes" });
  }
};

exports.approveCreator = async (req, res) => {
  try {
    const reason = (req.body?.reason || "").trim();
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) return res.status(404).json({ ok: false, message: "Usuario no encontrado" });

    const updates = {
      role: "creator",
      creatorStatus: "approved",
      isVerifiedCreator: true,
      creatorApprovedAt: new Date(),
      "creatorApplication.reviewDecision": "approved",
      "creatorApplication.reviewedAt": new Date(),
    };
    if (reason) updates["creatorApplication.reviewNote"] = reason.slice(0, MAX_REVIEW_NOTE_LENGTH);

    // Copy application fields into the active creatorProfile
    if (targetUser.creatorApplication) {
      const app = targetUser.creatorApplication;
      if (app.displayName?.trim()) updates["creatorProfile.displayName"] = app.displayName;
      if (app.bio?.trim()) updates["creatorProfile.bio"] = app.bio;
      if (app.category?.trim()) updates["creatorProfile.category"] = app.category;
    }

    // Auto-generate agency invite code so every approved creator can share invite links
    if (!targetUser.agencyProfile?.agencyCode) {
      updates["agencyProfile.agencyCode"] = await generateUniqueAgencyCode(targetUser);
    }

    // If user registered or applied via an agency invite link, auto-create a pending relationship
    if (targetUser.pendingAgencyCode) {
      try {
        const agencyOwner = await User.findOne({
          "agencyProfile.agencyCode": targetUser.pendingAgencyCode,
          role: "creator",
          creatorStatus: "approved",
        }).select("_id agencyProfile agencyRelationship");

        const canLink =
          agencyOwner &&
          String(agencyOwner._id) !== String(targetUser._id) &&
          !agencyOwner.agencyRelationship?.parentCreatorId; // agency owner must not itself be a sub-creator

        if (canLink) {
          const existingRel = await AgencyRelationship.findOne({
            subCreator: targetUser._id,
            status: { $in: ["pending", "active", "suspended"] },
          });

          if (!existingRel) {
            const pct = Math.min(30, Math.max(5, agencyOwner.agencyProfile?.subCreatorPercentageDefault || 20));
            await AgencyRelationship.create({
              parentCreator: agencyOwner._id,
              subCreator: targetUser._id,
              percentage: pct,
              status: "pending",
              createdBy: agencyOwner._id,
              notes: "Auto-creado desde enlace de invitación de agencia",
            });
          }
        }
      } catch (relErr) {
        // Non-fatal: log but don't block the approval
        console.error(
          "[approveCreator] Failed to auto-create agency relationship for userId=%s agencyCode=%s:",
          targetUser._id,
          targetUser.pendingAgencyCode,
          relErr
        );
      }
      updates.pendingAgencyCode = null;
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, select: "-password" });
    return res.json({ ok: true, user });
  } catch (error) {
    console.error("Approve creator error:", error);
    return res.status(500).json({ ok: false, message: "Error aprobando solicitud" });
  }
};

exports.rejectCreator = async (req, res) => {
  try {
    const reason = (req.body?.reason || "").trim();
    const updates = {
      role: "user",
      creatorStatus: "rejected",
      isVerifiedCreator: false,
      "creatorApplication.reviewDecision": "rejected",
      "creatorApplication.reviewedAt": new Date(),
    };
    if (reason) updates["creatorApplication.reviewNote"] = reason.slice(0, MAX_REVIEW_NOTE_LENGTH);
    const user = await User.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, select: "-password" }
    );
    if (!user) return res.status(404).json({ ok: false, message: "Usuario no encontrado" });
    return res.json({ ok: true, user });
  } catch (error) {
    console.error("Reject creator error:", error);
    return res.status(500).json({ ok: false, message: "Error rechazando solicitud" });
  }
};

exports.suspendCreator = async (req, res) => {
  try {
    const reason = (req.body?.reason || "").trim();
    const updates = {
      role: "user",
      creatorStatus: "suspended",
      isVerifiedCreator: false,
      "creatorApplication.reviewDecision": "suspended",
      "creatorApplication.reviewedAt": new Date(),
    };
    if (reason) updates["creatorApplication.reviewNote"] = reason.slice(0, MAX_REVIEW_NOTE_LENGTH);
    const user = await User.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, select: "-password" }
    );
    if (!user) return res.status(404).json({ ok: false, message: "Usuario no encontrado" });
    return res.json({ ok: true, user });
  } catch (error) {
    console.error("Suspend creator error:", error);
    return res.status(500).json({ ok: false, message: "Error suspendiendo creador" });
  }
};

exports.getVerificationRequests = async (req, res) => {
  try {
    const requests = await User.find({ verificationStatus: "pending" }, "-password")
      .sort({ createdAt: -1 })
      .limit(100);
    return res.json({ ok: true, requests });
  } catch (error) {
    console.error("Verification requests error:", error);
    return res.status(500).json({ ok: false, message: "Error obteniendo solicitudes de verificación" });
  }
};

exports.verifyUser = async (req, res) => {
  try {
    const { action } = req.body;
    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ ok: false, message: "Acción inválida. Usa 'approve' o 'reject'" });
    }
    const updates =
      action === "approve"
        ? { isVerified: true, verificationStatus: "approved" }
        : { isVerified: false, verificationStatus: "rejected" };
    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, select: "-password" });
    if (!user) return res.status(404).json({ ok: false, message: "Usuario no encontrado" });
    return res.json({ ok: true, user });
  } catch (error) {
    console.error("Verify user error:", error);
    return res.status(500).json({ ok: false, message: "Error procesando verificación" });
  }
};

exports.getActiveLives = async (req, res) => {
  try {
    const lives = await Live.find({ isLive: true })
      .populate("user", "username name avatar role")
      .sort({ createdAt: -1 })
      .limit(100);
    return res.json({ ok: true, lives });
  } catch (error) {
    console.error("Admin active lives error:", error);
    return res.status(500).json({ ok: false, message: "Error obteniendo streams activos" });
  }
};

exports.getTransactions = async (req, res) => {
  try {
    const ALLOWED_TYPES = [
      "crush_sent", "crush_received", "purchase", "gift_sent", "gift_received",
      "private_call", "call_started", "call_earned", "room_entry", "content_unlock",
      "content_earned", "refund", "admin_adjustment", "agency_earned", "agency_distributed",
      "boost_crush", "boost_pack", "swipe_unlock", "daily_reward", "simulation_unlock",
      "like_unlock", "referral_reward", "mission_reward",
    ];
    const filter = {};
    if (req.query.type && ALLOWED_TYPES.includes(req.query.type)) {
      filter.type = req.query.type;
    }
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      CoinTransaction.find(filter)
        .populate("userId", "username name avatar")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      CoinTransaction.countDocuments(filter),
    ]);

    return res.json({ ok: true, transactions, total, page, limit });
  } catch (error) {
    console.error("Admin transactions error:", error);
    return res.status(500).json({ ok: false, message: "Error obteniendo transacciones" });
  }
};

// ── Creator management ──────────────────────────────────────────────────────

exports.reactivateCreator = async (req, res) => {
  try {
    const reason = (req.body?.reason || "").trim();
    const updates = {
      role: "creator",
      creatorStatus: "approved",
      isVerifiedCreator: true,
      "creatorApplication.reviewDecision": "reactivated",
      "creatorApplication.reviewedAt": new Date(),
    };
    if (reason) updates["creatorApplication.reviewNote"] = reason.slice(0, MAX_REVIEW_NOTE_LENGTH);
    const user = await User.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, select: "-password" }
    );
    if (!user) return res.status(404).json({ ok: false, message: "Usuario no encontrado" });
    return res.json({ ok: true, user });
  } catch (error) {
    console.error("Reactivate creator error:", error);
    return res.status(500).json({ ok: false, message: "Error reactivando creador" });
  }
};

exports.getCreators = async (req, res) => {
  try {
    const ALLOWED_STATUSES = ["pending", "approved", "rejected", "suspended"];
    const filter = { creatorStatus: { $in: ALLOWED_STATUSES } };
    if (req.query.status && ALLOWED_STATUSES.includes(req.query.status)) {
      filter.creatorStatus = req.query.status;
    }
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const [creators, total] = await Promise.all([
      User.find(filter, "-password")
        .sort({ "creatorApplication.submittedAt": -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    return res.json({ ok: true, creators, total, page, limit });
  } catch (error) {
    console.error("Admin creators error:", error);
    return res.status(500).json({ ok: false, message: "Error obteniendo creadores" });
  }
};

exports.getCreatorDetail = async (req, res) => {
  try {
    const creator = await User.findById(req.params.id, "-password");
    if (!creator) return res.status(404).json({ ok: false, message: "Creador no encontrado" });

    const [lives, gifts, payouts] = await Promise.all([
      Live.find({ user: creator._id }).sort({ createdAt: -1 }).limit(20),
      Gift.find({ receiver: creator._id }).sort({ createdAt: -1 }).limit(20),
      Payout.find({ creator: creator._id }).sort({ createdAt: -1 }).limit(10),
    ]);

    return res.json({ ok: true, creator, lives, gifts, payouts });
  } catch (error) {
    console.error("Admin creator detail error:", error);
    return res.status(500).json({ ok: false, message: "Error obteniendo detalle del creador" });
  }
};

// ── User moderation ─────────────────────────────────────────────────────────

exports.suspendUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isSuspended: true },
      { new: true, select: "-password" }
    );
    if (!user) return res.status(404).json({ ok: false, message: "Usuario no encontrado" });
    return res.json({ ok: true, message: "Usuario suspendido", user });
  } catch (error) {
    console.error("Suspend user error:", error);
    return res.status(500).json({ ok: false, message: "Error suspendiendo usuario" });
  }
};

exports.unsuspendUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isSuspended: false },
      { new: true, select: "-password" }
    );
    if (!user) return res.status(404).json({ ok: false, message: "Usuario no encontrado" });
    return res.json({ ok: true, message: "Usuario reactivado", user });
  } catch (error) {
    console.error("Unsuspend user error:", error);
    return res.status(500).json({ ok: false, message: "Error reactivando usuario" });
  }
};

// ── Report moderation ────────────────────────────────────────────────────────

exports.updateReport = async (req, res) => {
  try {
    const ALLOWED_STATUSES = ["pending", "reviewed", "dismissed"];
    const { status } = req.body;
    if (!status || !ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({ ok: false, message: "Estado inválido. Usa: pending, reviewed o dismissed" });
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ ok: false, message: "ID de reporte inválido" });
    }
    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate("reporter", "username name avatar");
    if (!report) return res.status(404).json({ ok: false, message: "Reporte no encontrado" });
    return res.json({ ok: true, report });
  } catch (error) {
    console.error("Update report error:", error);
    return res.status(500).json({ ok: false, message: "Error actualizando reporte" });
  }
};

// ── Live history ─────────────────────────────────────────────────────────────

exports.getLiveHistory = async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const lives = await Live.find({ isLive: false, endedAt: { $exists: true } })
      .populate("user", "username name avatar role")
      .sort({ endedAt: -1 })
      .limit(limit);
    return res.json({ ok: true, lives });
  } catch (error) {
    console.error("Admin live history error:", error);
    return res.status(500).json({ ok: false, message: "Error obteniendo historial de streams" });
  }
};

// ── Analytics ────────────────────────────────────────────────────────────────

exports.getAnalytics = async (req, res) => {
  try {
    const now = new Date();
    const day = 24 * 60 * 60 * 1000;

    // Build daily registration counts for the last 7 days, using midnight boundaries
    const todayMidnight = new Date(now);
    todayMidnight.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 7 }, (_, i) => {
      const start = new Date(todayMidnight.getTime() - (6 - i) * day);
      const end = new Date(start.getTime() + day);
      return { start, end, label: start.toLocaleDateString("es", { month: "short", day: "numeric" }) };
    });

    const [dailyRegistrations, dailyPurchases, topCreators, topSpenders, retentionStats] = await Promise.all([
      Promise.all(
        days.map(({ start, end, label }) =>
          User.countDocuments({ createdAt: { $gte: start, $lt: end } }).then((count) => ({ label, count }))
        )
      ),
      Promise.all(
        days.map(({ start, end, label }) =>
          CoinTransaction.aggregate([
            { $match: { type: "purchase", status: "completed", createdAt: { $gte: start, $lt: end } } },
            { $group: { _id: null, total: { $sum: "$amount" } } },
          ]).then((r) => ({ label, total: r[0]?.total ?? 0 }))
        )
      ),
      Gift.aggregate([
        { $match: { createdAt: { $gte: new Date(now - day) } } },
        { $group: { _id: "$receiver", totalGifts: { $sum: "$coinCost" }, count: { $sum: 1 } } },
        { $sort: { totalGifts: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "user",
            pipeline: [{ $project: { username: 1, name: 1, avatar: 1 } }],
          },
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      ]),
      CoinTransaction.aggregate([
        { $match: { type: "purchase", status: "completed", createdAt: { $gte: new Date(now - day) } } },
        { $group: { _id: "$userId", totalSpent: { $sum: "$amount" } } },
        { $sort: { totalSpent: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "user",
            pipeline: [{ $project: { username: 1, name: 1, avatar: 1 } }],
          },
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      ]),
      Promise.all([
        User.countDocuments({ lastActiveAt: { $gte: new Date(now - day) } }),
        User.countDocuments({ lastActiveAt: { $gte: new Date(now - 7 * day) } }),
        User.countDocuments({ lastActiveAt: { $gte: new Date(now - 30 * day) } }),
      ]),
    ]);

    const [dau, wau, mau] = retentionStats;

    return res.json({
      ok: true,
      analytics: {
        dailyRegistrations,
        dailyPurchases,
        topCreators,
        topSpenders,
        retention: { dau, wau, mau },
      },
    });
  } catch (error) {
    console.error("Admin analytics error:", error);
    return res.status(500).json({ ok: false, message: "Error obteniendo analytics" });
  }
};

// ── Revenue metrics ──────────────────────────────────────────────────────────

// Subscription price used for MRR estimate (must match the price in Stripe and
// the subscription page UI). Set SUBSCRIPTION_PRICE_USD env var to override.
const SUBSCRIPTION_PRICE_USD = parseFloat(process.env.SUBSCRIPTION_PRICE_USD || "9.99");

exports.getRevenueMetrics = async (req, res) => {
  try {
    const now = new Date();
    const day = 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = new Date(now - 30 * day);
    const sevenDaysAgo = new Date(now - 7 * day);

    // Build daily coin purchase totals for the last 30 days
    const todayMidnight = new Date(now);
    todayMidnight.setHours(0, 0, 0, 0);
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const start = new Date(todayMidnight.getTime() - (29 - i) * day);
      const end = new Date(start.getTime() + day);
      return { start, end, label: start.toLocaleDateString("es", { month: "short", day: "numeric" }) };
    });

    const [
      activeSubs,
      pastDueSubs,
      newSubsThisWeek,
      canceledLast30Days,
      totalCanceledEver,
      buyersLast30Days,
      totalCoinRevenueLast30Days,
      dailyCoinRevenue,
    ] = await Promise.all([
      Subscription.countDocuments({ status: "active" }),
      Subscription.countDocuments({ status: "past_due" }),
      Subscription.countDocuments({ status: "active", createdAt: { $gte: sevenDaysAgo } }),
      Subscription.countDocuments({ status: "canceled", updatedAt: { $gte: thirtyDaysAgo } }),
      Subscription.countDocuments({ status: "canceled" }),
      CoinTransaction.distinct("userId", {
        type: "purchase",
        status: "completed",
        createdAt: { $gte: thirtyDaysAgo },
      }).then((ids) => ids.length),
      CoinTransaction.aggregate([
        { $match: { type: "purchase", status: "completed", createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]).then((r) => r[0]?.total ?? 0),
      Promise.all(
        last30Days.map(({ start, end, label }) =>
          CoinTransaction.aggregate([
            { $match: { type: "purchase", status: "completed", createdAt: { $gte: start, $lt: end } } },
            { $group: { _id: null, total: { $sum: "$amount" } } },
          ]).then((r) => ({ label, total: r[0]?.total ?? 0 }))
        )
      ),
    ]);

    // Estimated MRR in USD
    const estimatedMRR = parseFloat((activeSubs * SUBSCRIPTION_PRICE_USD).toFixed(2));

    // Churn rate: cancellations in last 30d / (active + cancellations in last 30d)
    const churnBase = activeSubs + canceledLast30Days;
    const churnRate = churnBase > 0 ? parseFloat(((canceledLast30Days / churnBase) * 100).toFixed(1)) : 0;

    // Average coins purchased per buyer (last 30d)
    const avgCoinsPerBuyer = buyersLast30Days > 0
      ? Math.round(totalCoinRevenueLast30Days / buyersLast30Days)
      : 0;

    return res.json({
      ok: true,
      revenue: {
        subscriptions: {
          active: activeSubs,
          pastDue: pastDueSubs,
          newThisWeek: newSubsThisWeek,
          canceledLast30Days,
          totalCanceled: totalCanceledEver,
          churnRate,
          estimatedMRR,
          subscriptionPriceUsd: SUBSCRIPTION_PRICE_USD,
        },
        coins: {
          buyersLast30Days,
          totalCoinRevenueLast30Days,
          avgCoinsPerBuyer,
          dailyCoinRevenue,
        },
      },
    });
  } catch (error) {
    console.error("Admin revenue metrics error:", error);
    return res.status(500).json({ ok: false, message: "Error obteniendo métricas de ingresos" });
  }
};

// ── Settings ─────────────────────────────────────────────────────────────────

// In-memory fallback store for settings (persisted in User model's admin config or a dedicated settings collection)
// For simplicity we use a static in-memory object that can be read/updated at runtime.
// A production system should use a dedicated Settings collection in MongoDB.
const DEFAULT_SETTINGS = {
  boostPriceCrush: 50,
  boostPackPrice: 200,
  hiddenLikePrice: 20,
  dailyRewardBaseCoins: 20,
  referralRewardCoins: 50,
  creatorPlatformSplitPercent: 40,
};

let _runtimeSettings = { ...DEFAULT_SETTINGS };

exports.getSettings = async (req, res) => {
  return res.json({ ok: true, settings: { ..._runtimeSettings } });
};

exports.updateSettings = async (req, res) => {
  try {
    const ALLOWED_KEYS = Object.keys(DEFAULT_SETTINGS);
    const updates = {};
    for (const key of ALLOWED_KEYS) {
      if (req.body[key] !== undefined) {
        const val = Number(req.body[key]);
        if (isNaN(val) || val < 0) {
          return res.status(400).json({ ok: false, message: `Valor inválido para ${key}` });
        }
        updates[key] = val;
      }
    }
    _runtimeSettings = { ..._runtimeSettings, ...updates };
    console.log(`⚙️ Admin settings updated by ${req.userId}:`, updates);
    return res.json({ ok: true, settings: { ..._runtimeSettings } });
  } catch (error) {
    console.error("Admin settings update error:", error);
    return res.status(500).json({ ok: false, message: "Error actualizando configuración" });
  }
};
