const User = require("../models/User.js");
const Live = require("../models/Live.js");
const Report = require("../models/Report.js");
const Subscription = require("../models/Subscription.js");
const CoinTransaction = require("../models/CoinTransaction.js");

const ALLOWED_CREATOR_STATUSES = ["pending", "approved", "rejected", "suspended"];
const DEFAULT_CREATOR_STATUSES = ["pending", "approved", "suspended"];

exports.getOverview = async (req, res) => {
  try {
    const [users, lives, activeLives, reports, subscriptions, admins, totalCoinsResult] = await Promise.all([
      User.countDocuments(),
      Live.countDocuments(),
      Live.countDocuments({ isLive: true }),
      Report.countDocuments(),
      Subscription.countDocuments(),
      User.countDocuments({ role: "admin" }),
      CoinTransaction.aggregate([
        { $match: { type: "purchase", status: "completed" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
    ]);

    const totalCoinsPurchased = totalCoinsResult.length > 0 ? totalCoinsResult[0].total : 0;

    return res.json({
      ok: true,
      stats: {
        users,
        lives,
        activeLives,
        reports,
        subscriptions,
        admins,
        totalCoinsPurchased,
      },
    });
  } catch (error) {
    console.error("Admin overview error:", error);
    return res.status(500).json({ ok: false, message: "Error obteniendo resumen admin" });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const users = await User.find({}, "-password")
      .sort({ createdAt: -1 })
      .limit(100);

    return res.json({ ok: true, users });
  } catch (error) {
    console.error("Admin users error:", error);
    return res.status(500).json({ ok: false, message: "Error obteniendo usuarios" });
  }
};

exports.getReports = async (req, res) => {
  try {
    const reports = await Report.find({})
      .sort({ createdAt: -1 })
      .limit(100);

    return res.json({ ok: true, reports });
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
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) return res.status(404).json({ ok: false, message: "Usuario no encontrado" });

    const updates = {
      role: "creator",
      creatorStatus: "approved",
      isVerifiedCreator: true,
      creatorApprovedAt: new Date(),
    };

    // Copy application fields into the active creatorProfile
    if (targetUser.creatorApplication) {
      const app = targetUser.creatorApplication;
      if (app.displayName?.trim()) updates["creatorProfile.displayName"] = app.displayName;
      if (app.bio?.trim()) updates["creatorProfile.bio"] = app.bio;
      if (app.category?.trim()) updates["creatorProfile.category"] = app.category;
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
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role: "user", creatorStatus: "rejected", isVerifiedCreator: false },
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
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role: "user", creatorStatus: "suspended", isVerifiedCreator: false },
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
