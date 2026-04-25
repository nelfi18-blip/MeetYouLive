const { Router } = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const { requireAdmin } = require("../middlewares/admin.middleware.js");
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
} = require("../controllers/admin.controller.js");

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

    if (adminUser.role !== "admin") {
      console.log("❌ No es admin. Rol actual:", adminUser.role);
      return res.status(403).json({
        message: "Acceso solo para administradores",
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

// All routes below require a valid JWT and admin role
router.use(adminLimiter, verifyToken, requireAdmin);

router.get("/overview", getOverview);
router.get("/users", getUsers);
router.patch("/users/:id/suspend", suspendUser);
router.patch("/users/:id/unsuspend", unsuspendUser);
router.get("/reports", getReports);
router.patch("/reports/:id", updateReport);
router.patch("/make-admin", makeAdmin);
router.get("/creator-requests", getCreatorRequests);
router.patch("/creator-requests/:id/approve", approveCreator);
router.patch("/creator-requests/:id/reject", rejectCreator);
router.patch("/creator-requests/:id/suspend", suspendCreator);
router.get("/creators", getCreators);
router.get("/creators/:id", getCreatorDetail);
router.patch("/creators/:id/approve", approveCreator);
router.patch("/creators/:id/reject", rejectCreator);
router.patch("/creators/:id/suspend", suspendCreator);
router.patch("/creators/:id/reactivate", reactivateCreator);
router.get("/verifications", getVerificationRequests);
router.patch("/users/:id/verify", verifyUser);
router.get("/lives", getActiveLives);
router.get("/lives/history", getLiveHistory);
router.get("/transactions", getTransactions);
router.get("/analytics", getAnalytics);
router.get("/revenue", getRevenueMetrics);
router.get("/settings", getSettings);
router.patch("/settings", updateSettings);

router.patch("/users/:id/role", async (req, res) => {
  const { role } = req.body;
  if (!["user", "creator", "admin"].includes(role)) {
    return res.status(400).json({ message: "Rol inválido" });
  }
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select("-password");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json(user);
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

// GET /api/admin/payouts — list payout requests with optional status filter and pagination
router.get("/payouts", async (req, res) => {
  try {
    const ALLOWED_PAYOUT_STATUSES = ["pending", "approved", "paid", "rejected", "processing", "completed"];
    const MAX_PAYOUT_LIMIT = 100;
    const DEFAULT_PAYOUT_LIMIT = 50;
    const MAX_REJECTION_REASON_LENGTH = 300;
    const MAX_NOTES_LENGTH = 500;

    const rawStatus = typeof req.query.status === "string" ? req.query.status : "";
    const validatedStatus = ALLOWED_PAYOUT_STATUSES.includes(rawStatus) ? rawStatus : null;

    const filter = validatedStatus ? { status: validatedStatus } : {};
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(MAX_PAYOUT_LIMIT, Math.max(1, parseInt(req.query.limit) || DEFAULT_PAYOUT_LIMIT));
    const skip = (page - 1) * limit;

    const [payouts, total] = await Promise.all([
      Payout.find(filter)
        .populate("creator", "username name email avatar earningsCoins creatorStatus isSuspended")
        .populate("reviewedBy", "username name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Payout.countDocuments(filter),
    ]);
    res.json({ payouts, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/admin/payouts/:id — update payout status
// Allowed transitions:
//   pending   → approved | rejected
//   approved  → paid | rejected
//   (legacy)  processing → completed | rejected
// Body: { status: "approved" | "paid" | "rejected", notes?, rejectionReason? }
router.patch("/payouts/:id", async (req, res) => {
  const MAX_REJECTION_REASON_LENGTH = 300;
  const MAX_NOTES_LENGTH = 500;

  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "id inválido" });
    }
    const { status, notes, rejectionReason } = req.body;
    const allowedTransitions = ["approved", "paid", "rejected", "processing", "completed"];
    if (!allowedTransitions.includes(status)) {
      return res.status(400).json({ message: "Estado inválido. Usa: approved, paid o rejected" });
    }

    const payout = await Payout.findById(new mongoose.Types.ObjectId(req.params.id));
    if (!payout) return res.status(404).json({ message: "Solicitud de pago no encontrada" });

    const terminal = ["paid", "completed", "rejected"];
    if (terminal.includes(payout.status)) {
      return res.status(400).json({ message: "Esta solicitud ya fue procesada" });
    }

    // Restore earningsCoins to creator when rejecting
    if (status === "rejected") {
      await User.findByIdAndUpdate(payout.creator, {
        $inc: { earningsCoins: payout.amountCoins },
      });
      payout.rejectionReason = (typeof rejectionReason === "string" ? rejectionReason : "").slice(0, MAX_REJECTION_REASON_LENGTH);
      payout.processedAt = new Date();
      console.log(`[payout] REJECTED id=${payout._id} creator=${payout.creator} coins=${payout.amountCoins} restored by admin=${req.userId}`);
    }

    // Mark processedAt when moving to paid or completed
    if (status === "paid" || status === "completed") {
      payout.processedAt = new Date();
      console.log(`[payout] PAID id=${payout._id} creator=${payout.creator} coins=${payout.amountCoins} by admin=${req.userId}`);
    }

    if (status === "approved") {
      console.log(`[payout] APPROVED id=${payout._id} creator=${payout.creator} coins=${payout.amountCoins} by admin=${req.userId}`);
    }

    payout.status = status;
    payout.reviewedBy = req.userId;
    if (notes !== undefined) payout.notes = String(notes).slice(0, MAX_NOTES_LENGTH);
    await payout.save();

    const populated = await Payout.findById(payout._id)
      .populate("creator", "username name email earningsCoins")
      .populate("reviewedBy", "username name");
    res.json({ message: "Solicitud actualizada", payout: populated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
