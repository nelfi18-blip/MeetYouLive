const User = require("../models/User.js");
const Live = require("../models/Live.js");
const Report = require("../models/Report.js");
const Subscription = require("../models/Subscription.js");
const CoinTransaction = require("../models/CoinTransaction.js");
const Gift = require("../models/Gift.js");
const Payout = require("../models/Payout.js");
const AgencyRelationship = require("../models/AgencyRelationship.js");
const AnalyticsEvent = require("../models/AnalyticsEvent.js");
const Message = require("../models/Message.js");
const Chat = require("../models/Chat.js");
const Video = require("../models/Video.js");
const Notification = require("../models/Notification.js");
const Like = require("../models/Like.js");
const Purchase = require("../models/Purchase.js");
const { STAFF_ROLES } = require("../middlewares/admin.middleware.js");
const { logStaffAction } = require("../services/audit.service.js");
const { isLiveActuallyActive, cleanupStaleLives } = require("../services/live.service.js");
const { notifyCreatorDecision } = require("../services/essentialNotification.service.js");
const mongoose = require("mongoose");

const normalizeHttpProtocol = (value) => {
  const protocol = typeof value === "string" ? value.replace(/:$/, "").toLowerCase() : "";
  return protocol === "http" || protocol === "https" ? protocol : "https";
};

const getRequestOrigin = (req) => {
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = normalizeHttpProtocol(forwardedProto || req.protocol);
  const host = req.get("x-forwarded-host")?.split(",")[0]?.trim() || req.get("host");
  if (!host || /[/\\?#@]/.test(host)) return "";
  let parsedHost;
  try {
    parsedHost = new URL(`${protocol}://${host}`);
  } catch {
    return "";
  }
  const hostname = parsedHost.hostname || "";
  const port = parsedHost.port ? Number(parsedHost.port) : null;
  const validHostname =
    hostname === "localhost" ||
    (hostname.includes(".") &&
      !hostname.includes("--") &&
      !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname) &&
      !hostname.includes(":") &&
      hostname
        .split(".")
        .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)));
  if (!validHostname || (port !== null && (port < 1 || port > 65535))) return "";
  return `${protocol}://${host}`;
};

const getPhotoUrlValue = (value) => {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return value.secure_url || value.url || value.src || value.path || "";
};

const normalizeAdminPhotoUrl = (req, value) => {
  const rawValue = getPhotoUrlValue(value);
  if (typeof rawValue !== "string") return "";
  const trimmed = rawValue.trim();
  if (!trimmed) return "";

  const requestOrigin = getRequestOrigin(req);
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (url.pathname.startsWith("/api/uploads/")) {
        url.pathname = url.pathname.replace(/^\/api\/uploads\//, "/uploads/");
      }
      if (requestOrigin) {
        const requestUrl = new URL(requestOrigin);
        if (
          url.protocol === "http:" &&
          requestUrl.protocol === "https:" &&
          url.hostname === requestUrl.hostname &&
          url.pathname.startsWith("/uploads/")
        ) {
          url.protocol = "https:";
        }
      }
      return url.toString();
    } catch {
      return "";
    }
  }

  if (trimmed.startsWith("//")) return `https:${trimmed}`;

  const normalizedPath = trimmed
    .replace(/^\/?api\/uploads\//i, "uploads/")
    .replace(/^\/?uploads\//i, "uploads/");
  if (/^uploads\//.test(normalizedPath)) {
    const uploadPath = `/${normalizedPath.replace(/^\/+/, "")}`;
    return requestOrigin ? `${requestOrigin}${uploadPath}` : uploadPath;
  }

  return "";
};

const serializeAdminUser = (req, user) => {
  const rawPhotos = [
    ...(Array.isArray(user.profilePhotos) ? user.profilePhotos : []),
    ...(Array.isArray(user.photos) ? user.photos : []),
    user.profileImage,
    user.avatar,
    user.photo,
  ].filter(Boolean);
  const normalizedPhotos = [];
  for (const photo of rawPhotos) {
    const normalized = normalizeAdminPhotoUrl(req, photo);
    if (normalized && !normalizedPhotos.includes(normalized)) normalizedPhotos.push(normalized);
  }
  const avatar = normalizedPhotos[0] || "";
  const { password, ...safeUser } = user;
  return {
    ...safeUser,
    avatar,
    profileImage: avatar,
    photo: avatar,
    profilePhotos: normalizedPhotos,
    photos: normalizedPhotos,
  };
};

const PLATFORM_EARNINGS_RATE = 0.4;
/** Retries up to MAX_ATTEMPTS times to ensure uniqueness. */
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

/** Generate unique creator invite code for viral growth */
async function generateUniqueCreatorInviteCode(user) {
  const crypto = require("crypto");
  const MAX_ATTEMPTS = 10;
  const base = ((user.username || user.name || "CRT").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 4)) || "CRT";
  
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 5);
    const code = base + randomPart;
    const exists = await User.exists({ creatorInviteCode: code });
    if (!exists) return code;
  }
  // Fallback: timestamp-based suffix guaranteed to be unique
  return "CRT" + Date.now().toString(36).toUpperCase().slice(-6);
}

const ALLOWED_CREATOR_STATUSES = ["pending", "approved", "rejected", "suspended"];
const DEFAULT_CREATOR_STATUSES = ["pending", "approved", "suspended"];
const MAX_REVIEW_NOTE_LENGTH = 300;

exports.getOverview = async (req, res) => {
  try {
    // Cleanup stale lives first (fire-and-forget)
    cleanupStaleLives().catch((err) => {
      console.error("Background stale live cleanup failed:", err);
    });

    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeUsersToday,
      totalCreators,
      pendingCreators,
      suspendedCreators,
      activeLivesMarkedActive,
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
      Live.find({ isLive: true }).select("createdAt isLive endedAt").lean(),
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

    // Filter to count only truly active lives (not stale/ghost)
    const activeLives = activeLivesMarkedActive.filter(live => isLiveActuallyActive(live)).length;

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
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    res.set("Cache-Control", "no-store");
    return res.json({ ok: true, users: users.map((user) => serializeAdminUser(req, user)), total, page, limit });
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

    // Log role change for audit trail
    await logStaffAction({
      staffId: req.userId,
      staffRole: "admin",
      action: "make_admin",
      targetType: "User",
      targetId: user._id,
      targetIdentifier: user.username || user.email,
      details: {
        previousRole: "user",
        newRole: "admin",
      },
      ipAddress: req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress,
    });

    console.log("[admin] Role change logged", {
      adminId: req.userId,
      targetUserId: String(user._id),
      newRole: "admin",
    });

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

    // Determine if this is a subCreator or regular creator approval
    const isSubCreatorApproval = targetUser.invitedByCreator && targetUser.role === "subCreator";

    const updates = {
      role: isSubCreatorApproval ? "subCreator" : "creator", // Keep subCreator role if invited
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

    // Only generate codes for full creators, not subCreators
    if (!isSubCreatorApproval) {
      // Auto-generate agency invite code so every approved creator can share invite links
      if (!targetUser.agencyProfile?.agencyCode) {
        updates["agencyProfile.agencyCode"] = await generateUniqueAgencyCode(targetUser);
      }

      // Auto-generate creator invite code for viral growth
      if (!targetUser.creatorInviteCode) {
        updates.creatorInviteCode = await generateUniqueCreatorInviteCode(targetUser);
      }
    }

    // If this is a subCreator, auto-create agency relationship with parent
    if (isSubCreatorApproval && targetUser.invitedByCreator) {
      try {
        const parentCreator = await User.findOne({
          _id: targetUser.invitedByCreator,
          role: "creator",
          creatorStatus: "approved",
        }).select("_id agencyProfile");

        if (parentCreator) {
          const existingRel = await AgencyRelationship.findOne({
            subCreator: targetUser._id,
            status: { $in: ["pending", "active", "suspended"] },
          });

          if (!existingRel) {
            const pct = Math.min(30, Math.max(5, parentCreator.agencyProfile?.subCreatorPercentageDefault || 20));
            await AgencyRelationship.create({
              parentCreator: parentCreator._id,
              subCreator: targetUser._id,
              percentage: pct,
              status: "pending", // Still requires parent and subCreator agreement
              createdBy: req.userId, // Admin who approved
              notes: "Auto-creado desde invitación de creador",
            });
          }
        }
      } catch (relErr) {
        console.error(
          "[approveCreator] Failed to auto-create creator invite relationship for userId=%s parentId=%s:",
          targetUser._id,
          targetUser.invitedByCreator,
          relErr
        );
      }
    }

    // If user registered or applied via an agency invite link, auto-create a pending relationship
    // (This is for the legacy agency code flow)
    if (targetUser.pendingAgencyCode && !isSubCreatorApproval) {
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
    
    // Log creator approval for audit trail
    await logStaffAction({
      staffId: req.userId,
      staffRole: "admin",
      action: "approve_creator",
      targetType: "Creator",
      targetId: user._id,
      targetIdentifier: user.username || user.email,
      details: {
        previousStatus: targetUser.creatorStatus,
        newStatus: "approved",
        isSubCreator: isSubCreatorApproval,
        reviewNote: reason || "No review note provided",
      },
      ipAddress: req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress,
    });

    console.log("[admin] Creator approval logged", {
      adminId: req.userId,
      targetUserId: String(user._id),
      isSubCreator: isSubCreatorApproval,
    });

    await notifyCreatorDecision({ userId: user._id, approved: true });
    
    return res.json({ ok: true, user });
  } catch (error) {
    console.error("Approve creator error:", error);
    return res.status(500).json({ ok: false, message: "Error aprobando solicitud" });
  }
};

exports.rejectCreator = async (req, res) => {
  try {
    const reason = (req.body?.reason || "").trim();
    const targetUser = await User.findById(req.params.id).select("username email creatorStatus");
    if (!targetUser) return res.status(404).json({ ok: false, message: "Usuario no encontrado" });

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
    
    // Log creator rejection for audit trail
    await logStaffAction({
      staffId: req.userId,
      staffRole: "admin",
      action: "reject_creator",
      targetType: "Creator",
      targetId: user._id,
      targetIdentifier: user.username || user.email,
      details: {
        previousStatus: targetUser.creatorStatus,
        newStatus: "rejected",
        reviewNote: reason || "No reason provided",
      },
      ipAddress: req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress,
    });

    console.log("[admin] Creator rejection logged", {
      adminId: req.userId,
      targetUserId: String(user._id),
      reviewNoteStoredInAuditLog: Boolean(reason),
    });

    await notifyCreatorDecision({ userId: user._id, approved: false });
    
    return res.json({ ok: true, user });
  } catch (error) {
    console.error("Reject creator error:", error);
    return res.status(500).json({ ok: false, message: "Error rechazando solicitud" });
  }
};

exports.suspendCreator = async (req, res) => {
  try {
    const reason = (req.body?.reason || "").trim();
    const targetUser = await User.findById(req.params.id).select("username email role creatorStatus");
    if (!targetUser) return res.status(404).json({ ok: false, message: "Usuario no encontrado" });

    const previousRole = targetUser.role;
    const previousStatus = targetUser.creatorStatus;

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

    // Log suspension for audit trail
    await logStaffAction({
      staffId: req.userId,
      staffRole: "admin",
      action: "suspend_creator",
      targetType: "Creator",
      targetId: user._id,
      targetIdentifier: user.username || user.email,
      details: {
        previousRole,
        previousStatus,
        newRole: "user",
        newStatus: "suspended",
        reason: reason || "No reason provided",
      },
      ipAddress: req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress,
    });

    console.log("[admin] Creator suspension logged", {
      adminId: req.userId,
      targetUserId: String(user._id),
      reason,
    });

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
    // First, cleanup any stale lives (runs in background)
    cleanupStaleLives().catch((err) => {
      console.error("Background stale live cleanup failed:", err);
    });

    const lives = await Live.find({ isLive: true })
      .populate("user", "username name avatar role")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    
    // Filter out stale/ghost lives that exceed max duration
    const activeLives = lives.filter(live => isLiveActuallyActive(live));
    
    return res.json({ ok: true, lives: activeLives });
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
    const targetUser = await User.findById(req.params.id).select("username email isSuspended");
    if (!targetUser) return res.status(404).json({ ok: false, message: "Usuario no encontrado" });

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isSuspended: true },
      { new: true, select: "-password" }
    );

    // Log suspension for audit trail
    await logStaffAction({
      staffId: req.userId,
      staffRole: "admin",
      action: "suspend_user",
      targetType: "User",
      targetId: user._id,
      targetIdentifier: user.username || user.email,
      details: {
        previouslySuspended: targetUser.isSuspended || false,
        newSuspendedStatus: true,
      },
      ipAddress: req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress,
    });

    console.log("[admin] User suspension logged", {
      adminId: req.userId,
      targetUserId: String(user._id),
    });

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

    // Log unsuspension for audit trail
    await logStaffAction({
      staffId: req.userId,
      staffRole: "admin",
      action: "unsuspend_user",
      targetType: "User",
      targetId: user._id,
      targetIdentifier: user.username || user.email,
      details: {
        newSuspendedStatus: false,
      },
      ipAddress: req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress,
    });

    console.log("[admin] User unsuspension logged", {
      adminId: req.userId,
      targetUserId: String(user._id),
    });

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

    const existingReport = await Report.findById(req.params.id).select("status");
    if (!existingReport) return res.status(404).json({ ok: false, message: "Reporte no encontrado" });

    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate("reporter", "username name avatar");

    // Log report action for audit trail
    await logStaffAction({
      staffId: req.userId,
      staffRole: "admin",
      action: "update_report",
      targetType: "Report",
      targetId: report._id,
      targetIdentifier: `Report-${String(report._id).slice(-8)}`,
      details: {
        previousStatus: existingReport.status,
        newStatus: status,
        reportType: report.type || "unknown",
      },
      ipAddress: req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress,
    });

    console.log("[admin] Report update logged", {
      adminId: req.userId,
      reportId: String(report._id),
      newStatus: status,
    });

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

// ── Metrics overview ─────────────────────────────────────────────────────────

/**
 * GET /api/admin/metrics/overview
 *
 * Returns a concise snapshot of key business metrics computed from the
 * AnalyticsEvent collection plus existing User data:
 *   - DAU   : daily active users (lastActiveAt in the last 24 h)
 *   - revenue30d : total USD revenue from all paying sources (last 30 days)
 *   - coinRevenue30d : USD revenue from coin purchases (last 30 days)
 *   - vipRevenue30d : USD revenue from new VIP subscriptions (last 30 days)
 *   - arppu  : average revenue per paying user across all revenue streams (last 30 d)
 *   - conversionRate : paying users (coins + VIP) / total users (%)
 *   - payingUsers30d : distinct users who made any purchase (coins or VIP, last 30 days)
 *   - totalUsers : total registered users
 *   - giftsSent30d : total gift_sent events (last 30 days)
 *   - liveJoins30d : total live_joined events (last 30 days)
 *   - referralConversions30d : total referral_converted events (last 30 days)
 */
exports.getMetricsOverview = async (req, res) => {
  try {
    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [
      dau,
      totalUsers,
      coinRevenueResult,
      vipRevenueResult,
      giftsSent30d,
      liveJoins30d,
      referralConversions30d,
    ] = await Promise.all([
      // DAU reuses the existing lastActiveAt field already updated on each request
      User.countDocuments({ lastActiveAt: { $gte: oneDayAgo } }),
      User.countDocuments(),
      // Coin purchase revenue: aggregate distinct paying users and sum USD amounts
      AnalyticsEvent.aggregate([
        { $match: { event: "coins_purchased", createdAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$data.amount_usd" },
            payingUserIds: { $addToSet: "$userId" },
          },
        },
      ]),
      // VIP subscription revenue (new subscriptions only, not renewals)
      AnalyticsEvent.aggregate([
        { $match: { event: "vip_subscribed", createdAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$data.amount_usd" },
            payingUserIds: { $addToSet: "$userId" },
          },
        },
      ]),
      AnalyticsEvent.countDocuments({ event: "gift_sent", createdAt: { $gte: thirtyDaysAgo } }),
      AnalyticsEvent.countDocuments({ event: "live_joined", createdAt: { $gte: thirtyDaysAgo } }),
      AnalyticsEvent.countDocuments({ event: "referral_converted", createdAt: { $gte: thirtyDaysAgo } }),
    ]);

    const coinRevenue30d = parseFloat((coinRevenueResult[0]?.totalRevenue ?? 0).toFixed(2));
    const vipRevenue30d = parseFloat((vipRevenueResult[0]?.totalRevenue ?? 0).toFixed(2));
    const revenue30d = parseFloat((coinRevenue30d + vipRevenue30d).toFixed(2));

    // Distinct paying users across both revenue streams
    const coinPayerIds = new Set((coinRevenueResult[0]?.payingUserIds ?? []).map(String));
    const vipPayerIds = new Set((vipRevenueResult[0]?.payingUserIds ?? []).map(String));
    const allPayerIds = new Set([...coinPayerIds, ...vipPayerIds]);
    const payingUsers30d = allPayerIds.size;

    const arppu = payingUsers30d > 0
      ? parseFloat((revenue30d / payingUsers30d).toFixed(2))
      : 0;
    const conversionRate = totalUsers > 0
      ? parseFloat(((payingUsers30d / totalUsers) * 100).toFixed(2))
      : 0;

    return res.json({
      ok: true,
      metrics: {
        dau,
        revenue30d,
        coinRevenue30d,
        vipRevenue30d,
        arppu,
        conversionRate,
        payingUsers30d,
        totalUsers,
        giftsSent30d,
        liveJoins30d,
        referralConversions30d,
      },
    });
  } catch (error) {
    console.error("Admin metrics overview error:", error);
    return res.status(500).json({ ok: false, message: "Error obteniendo métricas" });
  }
};

/**
 * Hard delete a user and all their related data (test cleanup only)
 * DELETE /api/admin/users/:id/hard-delete
 * 
 * Safety rules:
 * - Admin cannot delete themselves
 * - Cannot delete the last remaining admin
 * - Prefer not deleting admin/moderator accounts unless explicitly needed
 */
exports.hardDeleteUser = async (req, res) => {
  const { id: targetUserId } = req.params;
  
  try {
    // Validate target user ID
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ 
        ok: false, 
        message: "ID de usuario no válido" 
      });
    }

    // Rule 1: Admin cannot delete themselves
    if (String(targetUserId) === String(req.userId)) {
      return res.status(400).json({ 
        ok: false, 
        message: "No puedes eliminar tu propia cuenta de administrador" 
      });
    }

    // Fetch target user
    const targetUser = await User.findById(targetUserId).select("role username name email");
    if (!targetUser) {
      return res.status(404).json({ 
        ok: false, 
        message: "Usuario no encontrado" 
      });
    }

    // Rule 3: Staff roles can only be deleted by admin
    if (STAFF_ROLES.includes(targetUser.role)) {
      const requestingUser = await User.findById(req.userId).select("role");
      if (!requestingUser || requestingUser.role !== "admin") {
        await logStaffAction({
          staffId: req.userId,
          staffRole: requestingUser?.role || "unknown",
          action: "attempted_delete_staff",
          targetType: "User",
          targetId: targetUserId,
          targetIdentifier: targetUser.username || targetUser.email,
          details: { denied: true, targetRole: targetUser.role },
          ipAddress: req.ip,
        });
        return res.status(403).json({ 
          ok: false, 
          message: "Solo los administradores pueden eliminar cuentas de staff" 
        });
      }
    }

    // Rule 4: Check if deleting last admin
    if (targetUser.role === "admin") {
      const adminCount = await User.countDocuments({ role: "admin" });
      if (adminCount <= 1) {
        return res.status(400).json({ 
          ok: false, 
          message: "No se puede eliminar al último administrador del sistema" 
        });
      }
    }

    // Rule 5: Warn if trying to delete staff (but allow if not the last admin)
    if (STAFF_ROLES.includes(targetUser.role)) {
      console.warn(`Admin ${req.userId} is deleting ${targetUser.role} account ${targetUserId}`);
    }

    // Delete related data
    // Use Promise.allSettled to continue even if some deletions fail (critical safety feature)
    // This ensures the user is deleted even if some related collections have issues
    const cleanupResults = await Promise.allSettled([
      // Messages involving user (both sent and in chats they're part of)
      Message.deleteMany({ 
        $or: [
          { sender: targetUserId },
          { receiver: targetUserId }
        ]
      }),
      
      // Chats involving user
      Chat.deleteMany({ participants: targetUserId }),
      
      // Lives by user
      Live.deleteMany({ user: targetUserId }),
      
      // Videos by user
      Video.deleteMany({ user: targetUserId }),
      
      // Gifts sent by user
      Gift.deleteMany({ sender: targetUserId }),
      
      // Gifts received by user
      Gift.deleteMany({ receiver: targetUserId }),
      
      // Coin transactions by user
      CoinTransaction.deleteMany({ userId: targetUserId }),
      
      // Reports by user
      Report.deleteMany({ reporter: targetUserId }),
      
      // Reports about user
      Report.deleteMany({ reportedUserId: targetUserId }),
      
      // Subscriptions by user
      Subscription.deleteMany({ userId: targetUserId }),
      
      // Purchases by user
      Purchase.deleteMany({ userId: targetUserId }),
      
      // Notifications to/from user
      Notification.deleteMany({ 
        $or: [
          { userId: targetUserId },
          { "data.fromUserId": targetUserId }
        ]
      }),
      
      // Likes from user
      Like.deleteMany({ from: targetUserId }),
      
      // Likes to user
      Like.deleteMany({ to: targetUserId }),
      
      // Agency relationships where user is parent
      AgencyRelationship.deleteMany({ parentCreator: targetUserId }),
      
      // Agency relationships where user is sub-creator
      AgencyRelationship.deleteMany({ subCreator: targetUserId }),
      
      // Analytics events by user
      AnalyticsEvent.deleteMany({ userId: targetUserId }),
      
      // Payouts by user
      Payout.deleteMany({ userId: targetUserId }),
    ]);

    // Remove user from followers arrays and recalculate counts for affected users only
    // This is done separately to ensure we only update counts for users who were actually affected
    const affectedFollowers = await User.find({ followers: targetUserId }).select("_id").lean();
    const affectedFollowerIds = affectedFollowers.map(u => u._id);
    
    if (affectedFollowerIds.length > 0) {
      await User.updateMany(
        { _id: { $in: affectedFollowerIds } },
        { $pull: { followers: targetUserId } }
      );
      
      // Recalculate follower counts only for affected users
      await User.updateMany(
        { _id: { $in: affectedFollowerIds } },
        [{ $set: { followersCount: { $size: { $ifNull: ["$followers", []] } } } }]
      );
    }
    
    // Remove user from following arrays (no count field to update)
    await User.updateMany(
      { following: targetUserId },
      { $pull: { following: targetUserId } }
    );

    // Log any cleanup failures (but don't stop the deletion)
    cleanupResults.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(`Cleanup step ${index} failed:`, result.reason);
      }
    });

    // Finally, delete the user document
    await User.findByIdAndDelete(targetUserId);

    // Log the deletion
    await logStaffAction({
      staffId: req.userId,
      staffRole: "admin", // Only admin can hard delete
      action: "hard_delete_user",
      targetType: "User",
      targetId: targetUserId,
      targetIdentifier: targetUser.username || targetUser.email,
      details: { 
        deletedRole: targetUser.role,
        deletedEmail: targetUser.email,
        deletedUsername: targetUser.username 
      },
      ipAddress: req.ip,
    });

    return res.json({ 
      ok: true, 
      message: `Usuario ${targetUser.username || targetUser.email} eliminado completamente`,
      deletedUser: {
        id: targetUserId,
        username: targetUser.username,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role
      }
    });

  } catch (error) {
    console.error("Hard delete user error:", error);
    return res.status(500).json({ 
      ok: false, 
      message: "Error al eliminar usuario: " + error.message 
    });
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// PAYOUT MANAGEMENT
// ──────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/payouts — list all payout requests with filters
 */
exports.getPayouts = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    // Whitelist allowed statuses to prevent injection
    const ALLOWED_STATUSES = ["pending", "approved", "rejected", "paid"];
    const filter = {};
    
    if (status && ALLOWED_STATUSES.includes(status)) {
      filter.status = status;
    }

    const [payouts, total] = await Promise.all([
      Payout.find(filter)
        .populate("creator", "username name email avatar role creatorStatus")
        .populate("processedBy", "username name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Payout.countDocuments(filter),
    ]);

    return res.json({
      ok: true,
      payouts,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Admin getPayouts error:", error);
    return res.status(500).json({ ok: false, message: "Error al obtener retiros" });
  }
};

/**
 * PATCH /api/admin/payouts/:id — approve, reject, or mark payout as paid
 */
exports.updatePayout = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, rejectionReason, notes } = req.body;
    const adminId = req.userId;

    if (!["approve", "reject", "mark_paid"].includes(action)) {
      return res.status(400).json({
        ok: false,
        message: "Acción inválida. Use: approve, reject, mark_paid",
      });
    }

    const payout = await Payout.findById(id);
    if (!payout) {
      return res.status(404).json({ ok: false, message: "Retiro no encontrado" });
    }

    // Only pending payouts can be approved or rejected
    if (action === "approve" && payout.status !== "pending") {
      return res.status(400).json({
        ok: false,
        message: "Solo se pueden aprobar retiros pendientes",
      });
    }

    if (action === "reject" && payout.status !== "pending") {
      return res.status(400).json({
        ok: false,
        message: "Solo se pueden rechazar retiros pendientes",
      });
    }

    // Only approved payouts can be marked as paid
    if (action === "mark_paid" && payout.status !== "approved") {
      return res.status(400).json({
        ok: false,
        message: "Solo se pueden marcar como pagados retiros aprobados",
      });
    }

    if (action === "approve") {
      payout.status = "approved";
      payout.approvedAt = new Date();
      payout.processedBy = adminId;
      if (notes) payout.notes = notes;
      await payout.save();

      console.log(`[Admin] Payout ${id} approved by admin ${adminId}`);

      return res.json({
        ok: true,
        message: "Retiro aprobado correctamente",
        payout,
      });
    }

    if (action === "reject") {
      if (!rejectionReason || rejectionReason.trim().length < 5) {
        return res.status(400).json({
          ok: false,
          message: "Se requiere una razón de rechazo (mínimo 5 caracteres)",
        });
      }

      // Return reserved coins back to creator
      await User.findByIdAndUpdate(
        payout.creator,
        { $inc: { earningsCoins: payout.amountCoins } },
        { new: true }
      );

      payout.status = "rejected";
      payout.rejectionReason = rejectionReason;
      payout.processedBy = adminId;
      if (notes) payout.notes = notes;
      await payout.save();

      console.log(`[Admin] Payout ${id} rejected by admin ${adminId}. Coins restored: ${payout.amountCoins}`);

      return res.json({
        ok: true,
        message: "Retiro rechazado. Monedas devueltas al creador.",
        payout,
      });
    }

    if (action === "mark_paid") {
      payout.status = "paid";
      payout.paidAt = new Date();
      payout.processedBy = adminId;
      if (notes) payout.notes = notes;
      await payout.save();

      console.log(`[Admin] Payout ${id} marked as paid by admin ${adminId}`);

      return res.json({
        ok: true,
        message: "Retiro marcado como pagado",
        payout,
      });
    }
  } catch (error) {
    console.error("Admin updatePayout error:", error);
    return res.status(500).json({ ok: false, message: "Error al actualizar retiro" });
  }
};
