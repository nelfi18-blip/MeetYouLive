const { Router } = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const { 
  requireAdmin, 
  requireModeratorOrAdmin, 
  requirePermission 
} = require("../middlewares/admin.middleware.js");
const { logStaffAction } = require("../services/audit.service.js");
const User = require("../models/User.js");
const Video = require("../models/Video.js");
const Live = require("../models/Live.js");
const Payout = require("../models/Payout.js");
const AgencyRelationship = require("../models/AgencyRelationship.js");
const {
  getOverview,
  getUsers,
  getReports,
  updateReport,
  makeAdmin,
  getCreatorRequests,
  approveCreator,
  rejectCreator,
  suspendCreator,
  reactivateCreator,
  getCreators,
  getCreatorDetail,
  getVerificationRequests,
  verifyUser,
  getActiveLives,
  getLiveHistory,
  getTransactions,
  suspendUser,
  unsuspendUser,
  getAnalytics,
  getRevenueMetrics,
  getSettings,
  updateSettings,
  getMetricsOverview,
  hardDeleteUser,
  getPayouts,
  updatePayout,
} = require("../controllers/admin.controller.js");

const {
  listWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
} = require("../controllers/withdraw.controller.js");
const { getFeedDiagnostics } = require("../controllers/feed.controller.js");
const { getGrowthAnalytics } = require("../controllers/analytics.controller.js");

const router = Router();

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Demasiados intentos de acceso, intenta de nuevo más tarde" },
});

// Public admin login — validates email/password against the database
router.post("/login", adminLoginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log("🔐 Intento login admin:", email);

    if (!email || !password) {
      console.log("❌ Email o contraseña faltantes");
      return res.status(400).json({
        message: "Email y contraseña son requeridos",
      });
    }

    const adminUser = await User.findOne({ email });

    if (!adminUser) {
      console.log("❌ Admin no encontrado:", email);
      return res.status(401).json({
        message: "Credenciales inválidas",
      });
    }

    // Allow all staff roles to log in to admin panel
    const staffRoles = ["admin", "moderator", "support", "creator_manager", "finance", "content_reviewer"];
    if (!staffRoles.includes(adminUser.role)) {
      console.log("❌ No es staff. Rol actual:", adminUser.role);
      return res.status(403).json({
        message: "Acceso solo para personal autorizado",
      });
    }

    if (!adminUser.password) {
      console.log("❌ Usuario sin contraseña configurada:", email);
      return res.status(401).json({
        message: "Credenciales inválidas",
      });
    }

    const isMatch = await bcrypt.compare(password, adminUser.password);

    if (!isMatch) {
      console.log("❌ Password incorrecto para:", email);
      return res.status(401).json({
        message: "Credenciales inválidas",
      });
    }

    const token = jwt.sign(
      {
        id: adminUser._id,
        email: adminUser.email,
        username: adminUser.username,
        role: adminUser.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log("✅ Login exitoso para:", email);

    return res.json({
      token,
      user: {
        id: adminUser._id,
        name: adminUser.name,
        username: adminUser.username,
        email: adminUser.email,
        role: adminUser.role,
      },
    });
  } catch (error) {
    console.error("🔥 ERROR ADMIN LOGIN:", error);
    return res.status(500).json({
      message: "Error del servidor",
    });
  }
});

// Routes accessible by moderators, content_reviewers, and admin
router.get("/reports", adminLimiter, verifyToken, requirePermission("VIEW_REPORTS"), getReports);
router.patch("/reports/:id", adminLimiter, verifyToken, requirePermission("UPDATE_REPORTS"), updateReport);

// Users view: admin, support, moderator
router.get("/users", adminLimiter, verifyToken, requirePermission("VIEW_USERS"), getUsers);

// Lives view: admin, moderator
router.get("/lives", adminLimiter, verifyToken, requirePermission("VIEW_LIVES"), getActiveLives);
router.get("/lives/history", adminLimiter, verifyToken, requirePermission("VIEW_LIVES"), getLiveHistory);

// Creator requests: admin, creator_manager
router.get("/creator-requests", adminLimiter, verifyToken, requirePermission("VIEW_CREATOR_REQUESTS"), getCreatorRequests);
router.patch("/creator-requests/:id/approve", adminLimiter, verifyToken, requirePermission("APPROVE_CREATORS"), approveCreator);
router.patch("/creator-requests/:id/reject", adminLimiter, verifyToken, requirePermission("APPROVE_CREATORS"), rejectCreator);
router.patch("/creator-requests/:id/suspend", adminLimiter, verifyToken, requirePermission("APPROVE_CREATORS"), suspendCreator);

// Creators management: admin, creator_manager
router.get("/creators", adminLimiter, verifyToken, requirePermission("MANAGE_CREATORS"), getCreators);
router.get("/creators/:id", adminLimiter, verifyToken, requirePermission("MANAGE_CREATORS"), getCreatorDetail);
router.patch("/creators/:id/approve", adminLimiter, verifyToken, requirePermission("APPROVE_CREATORS"), approveCreator);
router.patch("/creators/:id/reject", adminLimiter, verifyToken, requirePermission("APPROVE_CREATORS"), rejectCreator);
router.patch("/creators/:id/suspend", adminLimiter, verifyToken, requirePermission("APPROVE_CREATORS"), suspendCreator);
router.patch("/creators/:id/reactivate", adminLimiter, verifyToken, requirePermission("APPROVE_CREATORS"), reactivateCreator);

// Payouts: admin, finance
router.get("/payouts", adminLimiter, verifyToken, requirePermission("VIEW_PAYOUTS"), async (req, res) => {
  try {
    const allowedStatuses = ["pending", "approved", "processing", "completed", "paid", "rejected"];
    const filter = {};
    if (req.query.status && allowedStatuses.includes(req.query.status)) {
      filter.status = req.query.status;
    }
    const payouts = await Payout.find(filter)
      .populate("creator", "username name email avatar earningsCoins")
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({ payouts });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch("/payouts/:id", adminLimiter, verifyToken, requirePermission("UPDATE_PAYOUTS"), async (req, res) => {
  const TERMINAL_STATUSES = ["completed", "paid", "rejected"];
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "id inválido" });
    }
    const { status, notes } = req.body;
    const allowedTransitions = ["approved", "paid", "processing", "completed", "rejected"];
    if (!allowedTransitions.includes(status)) {
      return res.status(400).json({ message: "Estado inválido. Usa: approved, paid, completed o rejected" });
    }

    const payout = await Payout.findById(req.params.id).populate("creator", "username email");
    if (!payout) return res.status(404).json({ message: "Solicitud de pago no encontrada" });

    if (TERMINAL_STATUSES.includes(payout.status)) {
      return res.status(400).json({ message: "Esta solicitud ya fue procesada" });
    }

    const oldStatus = payout.status;
    payout.status = status;
    if (notes !== undefined) payout.notes = notes;
    if (TERMINAL_STATUSES.includes(status)) {
      payout.processedAt = new Date();
    }
    if (status === "rejected") {
      payout.rejectionReason = notes || "Sin motivo indicado";
    }
    await payout.save();

    // Restore earningsCoins atomically if rejected so the creator can retry
    if (status === "rejected") {
      await User.findByIdAndUpdate(payout.creator, {
        $inc: { earningsCoins: payout.amountCoins },
      });
    }

    // Log the payout status change
    await logStaffAction({
      staffId: req.userId,
      staffRole: req.userRole,
      action: "update_payout_status",
      targetType: "Other",
      targetId: payout._id,
      targetIdentifier: `Payout ${payout._id} for ${payout.creator.username || payout.creator.email}`,
      details: { payoutId: payout._id, creatorId: payout.creator._id, oldStatus, newStatus: status, notes },
      ipAddress: req.ip,
    });

    const populated = await Payout.findById(payout._id).populate("creator", "username name email");
    res.json({ message: "Solicitud actualizada", payout: populated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Revenue: admin, finance
router.get("/revenue", adminLimiter, verifyToken, requirePermission("VIEW_REVENUE"), getRevenueMetrics);
router.get("/feed-diagnostics", adminLimiter, verifyToken, requireAdmin, getFeedDiagnostics);

// All routes below require admin role only
router.use(adminLimiter, verifyToken, requireAdmin);

router.get("/overview", getOverview);
router.patch("/users/:id/suspend", suspendUser);
router.patch("/users/:id/unsuspend", unsuspendUser);
router.patch("/make-admin", makeAdmin);
router.get("/verifications", getVerificationRequests);
router.patch("/users/:id/verify", verifyUser);
router.get("/transactions", getTransactions);
router.get("/analytics", getAnalytics);
router.get("/analytics/growth", getGrowthAnalytics);
router.get("/metrics/overview", getMetricsOverview);
router.get("/settings", getSettings);
router.patch("/settings", updateSettings);

router.patch("/users/:id/role", async (req, res) => {
  const { role } = req.body;
  const allRoles = ["user", "creator", "subCreator", "admin", "moderator", "support", "creator_manager", "finance", "content_reviewer"];
  
  if (!allRoles.includes(role)) {
    return res.status(400).json({ message: "Rol inválido" });
  }
  
  try {
    // Get current staff user info
    const staffUser = await User.findById(req.userId).select("role");
    if (!staffUser) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }
    
    // Only admin can change roles
    if (staffUser.role !== "admin") {
      await logStaffAction({
        staffId: req.userId,
        staffRole: staffUser.role,
        action: "attempted_role_change",
        targetType: "User",
        targetId: req.params.id,
        details: { requestedRole: role, denied: true },
        ipAddress: req.ip,
      });
      return res.status(403).json({ message: "Solo los administradores pueden cambiar roles" });
    }
    
    // Prevent changing own role
    if (req.userId.toString() === req.params.id.toString()) {
      await logStaffAction({
        staffId: req.userId,
        staffRole: staffUser.role,
        action: "attempted_self_role_change",
        targetType: "User",
        targetId: req.params.id,
        details: { requestedRole: role, denied: true },
        ipAddress: req.ip,
      });
      return res.status(403).json({ message: "No puedes cambiar tu propio rol" });
    }
    
    const targetUser = await User.findById(req.params.id).select("role username email");
    if (!targetUser) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    
    const oldRole = targetUser.role;
    targetUser.role = role;
    await targetUser.save();
    
    // Log the role change
    await logStaffAction({
      staffId: req.userId,
      staffRole: staffUser.role,
      action: "change_user_role",
      targetType: "User",
      targetId: req.params.id,
      targetIdentifier: targetUser.username || targetUser.email,
      details: { oldRole, newRole: role },
      ipAddress: req.ip,
    });
    
    const userResponse = await User.findById(req.params.id).select("-password");
    res.json(userResponse);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch("/users/:id/block", async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBlocked: true },
      { new: true }
    ).select("-password");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json({ message: "Usuario bloqueado", user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch("/users/:id/unblock", async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBlocked: false },
      { new: true }
    ).select("-password");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json({ message: "Usuario desbloqueado", user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/videos/:id", async (req, res) => {
  try {
    const video = await Video.findByIdAndDelete(req.params.id);
    if (!video) return res.status(404).json({ message: "Vídeo no encontrado" });
    res.json({ message: "Vídeo eliminado" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/lives/:id", async (req, res) => {
  try {
    const live = await Live.findByIdAndUpdate(
      req.params.id,
      { isLive: false, endedAt: new Date() },
      { new: true }
    );
    if (!live) return res.status(404).json({ message: "Live no encontrado" });
    res.json({ message: "Live terminado por admin", live });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Hard delete user (test cleanup) - requires admin authentication
router.delete("/users/:id/hard-delete", verifyToken, requireAdmin, hardDeleteUser);

// ── Agency admin routes ─────────────────────────────────────────────────────

// GET /api/admin/agencies — list all agency-enabled creators
router.get("/agencies", async (req, res) => {
  try {
    const agencies = await User.find({ "agencyProfile.enabled": true })
      .select("username name avatar creatorStatus agencyProfile agencyEarningsCoins totalAgencyGeneratedCoins")
      .sort({ "agencyProfile.subCreatorsCount": -1 });
    res.json({ agencies });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/admin/agencies/:creatorId/enable — enable agency for an approved creator
router.patch("/agencies/:creatorId/enable", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.creatorId)) {
      return res.status(400).json({ message: "creatorId inválido" });
    }
    const { agencyName, subCreatorPercentageDefault } = req.body;
    const creator = await User.findById(req.params.creatorId);
    if (!creator) return res.status(404).json({ message: "Creador no encontrado" });
    if (creator.role !== "creator" || creator.creatorStatus !== "approved") {
      return res.status(400).json({ message: "Solo los creadores aprobados pueden tener agencia habilitada" });
    }
    // Prevent subCreators from becoming agencies
    if (creator.role === "subCreator") {
      return res.status(400).json({ message: "Los sub-creadores no pueden tener agencia habilitada" });
    }
    // Prevent an active/pending sub-creator from also becoming an agency
    const rel = creator.agencyRelationship;
    if (rel && rel.parentCreatorId && ["active", "pending", "suspended"].includes(rel.status)) {
      return res.status(400).json({ message: "Un sub-creador activo no puede ser también una agencia" });
    }

    const pctDefault = Number(subCreatorPercentageDefault) || 10;
    const safePct = Math.min(30, Math.max(5, pctDefault));

    // Generate unique agency code if not set
    let agencyCode = creator.agencyProfile?.agencyCode;
    if (!agencyCode) {
      agencyCode = creator.username
        ? creator.username.toUpperCase().slice(0, 6) + Math.floor(1000 + Math.random() * 9000)
        : "AGY" + Math.floor(10000 + Math.random() * 90000);
    }

    const safeCreatorId = new mongoose.Types.ObjectId(req.params.creatorId);
    await User.findByIdAndUpdate(safeCreatorId, {
      "agencyProfile.enabled": true,
      "agencyProfile.agencyName": agencyName || creator.agencyProfile?.agencyName || creator.name || creator.username || "",
      "agencyProfile.agencyCode": agencyCode,
      "agencyProfile.subCreatorPercentageDefault": safePct,
    });

    res.json({ message: "Agencia habilitada correctamente" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/admin/agencies/:creatorId/disable — disable agency (doesn't remove existing links)
router.patch("/agencies/:creatorId/disable", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.creatorId)) {
      return res.status(400).json({ message: "creatorId inválido" });
    }
    await User.findByIdAndUpdate(new mongoose.Types.ObjectId(req.params.creatorId), { "agencyProfile.enabled": false });
    res.json({ message: "Agencia deshabilitada" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/admin/agency-links — list all agency relationships with optional status filter
router.get("/agency-links", async (req, res) => {
  try {
    const filter = {};
    const allowedStatuses = ["pending", "active", "suspended", "removed"];
    if (req.query.status && allowedStatuses.includes(req.query.status)) {
      filter.status = req.query.status;
    }
    const links = await AgencyRelationship.find(filter)
      .populate("parentCreator", "username name avatar")
      .populate("subCreator", "username name avatar creatorStatus")
      .populate("createdBy", "username name")
      .populate("approvedBy", "username name")
      .sort({ createdAt: -1 });
    res.json({ links });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/admin/agency-links/:id/approve — approve pending relationship
router.patch("/agency-links/:id/approve", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "id inválido" });
    }
    const rel = await AgencyRelationship.findById(req.params.id);
    if (!rel) return res.status(404).json({ message: "Relación no encontrada" });
    if (rel.status !== "pending") return res.status(400).json({ message: "La relación no está pendiente" });

    rel.status = "active";
    rel.approvedBy = req.userId;
    rel.approvedAt = new Date();
    await rel.save();

    // Update snapshot on sub-creator
    await User.findByIdAndUpdate(rel.subCreator, {
      "agencyRelationship.parentCreatorId": rel.parentCreator,
      "agencyRelationship.parentCreatorPercentage": rel.percentage,
      "agencyRelationship.joinedAt": new Date(),
      "agencyRelationship.status": "active",
    });

    // Increment parent creator sub-creator count
    await User.findByIdAndUpdate(rel.parentCreator, {
      $inc: { "agencyProfile.subCreatorsCount": 1 },
    });

    res.json({ message: "Relación aprobada" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/admin/agency-links/:id/suspend — suspend an active relationship
router.patch("/agency-links/:id/suspend", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "id inválido" });
    }
    const rel = await AgencyRelationship.findById(req.params.id);
    if (!rel) return res.status(404).json({ message: "Relación no encontrada" });
    if (!["pending", "active"].includes(rel.status)) {
      return res.status(400).json({ message: "No se puede suspender una relación en estado: " + rel.status });
    }

    const wasActive = rel.status === "active";
    rel.status = "suspended";
    rel.suspendedAt = new Date();
    await rel.save();

    await User.findByIdAndUpdate(rel.subCreator, { "agencyRelationship.status": "suspended" });
    if (wasActive) {
      await User.findByIdAndUpdate(rel.parentCreator, {
        $inc: { "agencyProfile.subCreatorsCount": -1 },
      });
    }

    res.json({ message: "Relación suspendida" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/admin/agency-links/:id/remove — permanently remove a relationship
router.patch("/agency-links/:id/remove", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "id inválido" });
    }
    const rel = await AgencyRelationship.findById(req.params.id);
    if (!rel) return res.status(404).json({ message: "Relación no encontrada" });
    if (rel.status === "removed") return res.status(400).json({ message: "La relación ya está eliminada" });

    const wasActive = rel.status === "active";
    rel.status = "removed";
    rel.removedAt = new Date();
    await rel.save();

    await User.findByIdAndUpdate(rel.subCreator, {
      "agencyRelationship.parentCreatorId": null,
      "agencyRelationship.parentCreatorPercentage": 0,
      "agencyRelationship.joinedAt": null,
      "agencyRelationship.status": "removed",
    });
    if (wasActive) {
      await User.findByIdAndUpdate(rel.parentCreator, {
        $inc: { "agencyProfile.subCreatorsCount": -1 },
      });
    }

    res.json({ message: "Relación eliminada" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Payout admin routes ─────────────────────────────────────────────────────

// GET /api/admin/payouts — list payout requests (optional ?status=pending|approved|rejected|paid)
router.get("/payouts", verifyToken, requireAdmin, getPayouts);

// PATCH /api/admin/payouts/:id — approve, reject, or mark payout as paid
// Body: { action: "approve" | "reject" | "mark_paid", rejectionReason?, notes? }
router.patch("/payouts/:id", verifyToken, requireAdmin, updatePayout);

// ── Fraud admin routes ──────────────────────────────────────────────────────

const FraudAlert = require("../models/FraudAlert.js");

// GET /api/admin/fraud/alerts — paginated alerts sorted by severity then date
router.get("/fraud/alerts", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const filter = {};
    const allowedStatuses = ["pending", "reviewed", "dismissed"];
    const allowedSeverities = ["low", "medium", "high", "critical"];
    const allowedAlertTypes = [
      "rate_limit_exceeded",
      "velocity_exceeded",
      "self_gifting",
      "new_account_restriction",
      "duplicate_transaction",
    ];
    if (req.query.status && allowedStatuses.includes(req.query.status)) filter.status = req.query.status;
    if (req.query.severity && allowedSeverities.includes(req.query.severity)) filter.severity = req.query.severity;
    if (req.query.alertType && allowedAlertTypes.includes(req.query.alertType)) filter.alertType = req.query.alertType;

    const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

    const [alerts, total] = await Promise.all([
      FraudAlert.find(filter)
        .populate("userId", "username name email avatar")
        .populate("reviewedBy", "username name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      FraudAlert.countDocuments(filter),
    ]);

    // Sort by severity weight within the returned page
    alerts.sort((a, b) => {
      const diff = (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4);
      return diff !== 0 ? diff : new Date(b.createdAt) - new Date(a.createdAt);
    });

    res.json({ alerts, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/admin/fraud/alerts/:id/review — mark as reviewed with optional notes
router.post("/fraud/alerts/:id/review", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "ID inválido" });
    }
    const { status } = req.body;
    // Sanitize notes to a plain string, preventing object injection
    const notes = typeof req.body.notes === "string" ? req.body.notes.trim() : "";
    const allowedStatuses = ["reviewed", "dismissed"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Estado inválido. Usa: reviewed o dismissed" });
    }
    const alert = await FraudAlert.findByIdAndUpdate(
      req.params.id,
      {
        status,
        reviewNotes: notes,
        reviewedBy: req.userId,
        reviewedAt: new Date(),
      },
      { new: true }
    );
    if (!alert) return res.status(404).json({ message: "Alerta no encontrada" });
    res.json({ alert });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/admin/fraud/stats — aggregate fraud stats
router.get("/fraud/stats", async (req, res) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // last 30 days

    const [total, blocked, bySeverity, byType, flaggedUsers] = await Promise.all([
      FraudAlert.countDocuments({ createdAt: { $gte: since } }),
      FraudAlert.countDocuments({ blocked: true, createdAt: { $gte: since } }),
      FraudAlert.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: "$severity", count: { $sum: 1 } } },
      ]),
      FraudAlert.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: "$alertType", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      FraudAlert.aggregate([
        { $match: { blocked: true, createdAt: { $gte: since } } },
        { $group: { _id: "$userId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "user",
            pipeline: [{ $project: { username: 1, name: 1, email: 1 } }],
          },
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      ]),
    ]);

    res.json({
      period: "last_30_days",
      totalAlerts: total,
      blockedTransactions: blocked,
      bySeverity: Object.fromEntries(bySeverity.map((s) => [s._id, s.count])),
      byType: Object.fromEntries(byType.map((s) => [s._id, s.count])),
      topFlaggedUsers: flaggedUsers.map((f) => ({
        userId: f._id,
        count: f.count,
        username: f.user?.username || "",
        name: f.user?.name || "",
        email: f.user?.email || "",
      })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Withdrawals
router.get("/withdrawals", adminLimiter, verifyToken, requireAdmin, listWithdrawals);
router.patch("/withdrawals/:id/approve", adminLimiter, verifyToken, requireAdmin, approveWithdrawal);
router.patch("/withdrawals/:id/reject", adminLimiter, verifyToken, requireAdmin, rejectWithdrawal);

module.exports = router;
