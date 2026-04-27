const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const { requireAdmin, requireModeratorOrAdmin } = require("../middlewares/admin.middleware.js");
const Report = require("../models/Report.js");
const User = require("../models/User.js");

const router = Router();

const moderationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

router.post("/report", moderationLimiter, verifyToken, async (req, res) => {
  const { targetType, targetId, reason } = req.body;
  if (!targetType || !targetId || !reason) {
    return res.status(400).json({ message: "targetType, targetId y reason son requeridos" });
  }
  try {
    const report = await Report.create({
      reporter: req.userId,
      targetType,
      targetId,
      reason,
    });
    res.status(201).json(report);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Moderators can view reports
router.get("/reports", moderationLimiter, verifyToken, requireModeratorOrAdmin, async (req, res) => {
  try {
    const reports = await Report.find({ status: "pending" })
      .populate("reporter", "username email")
      .sort({ createdAt: -1 });
    res.json(reports);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Moderators can update report status
router.patch("/reports/:id", moderationLimiter, verifyToken, requireModeratorOrAdmin, async (req, res) => {
  const { status } = req.body;
  if (!["reviewed", "dismissed"].includes(status)) {
    return res.status(400).json({ message: "Estado inválido" });
  }
  try {
    const report = await Report.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!report) return res.status(404).json({ message: "Reporte no encontrado" });
    res.json(report);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Moderators can suspend users (admin can override)
router.patch("/users/:id/suspend", moderationLimiter, verifyToken, requireModeratorOrAdmin, async (req, res) => {
  const { isSuspended } = req.body;
  if (typeof isSuspended !== "boolean") {
    return res.status(400).json({ message: "isSuspended debe ser boolean" });
  }
  try {
    const targetUser = await User.findById(req.params.id).select("role isSuspended");
    if (!targetUser) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    // Moderators cannot suspend admins or other moderators
    if (req.userRole === "moderator" && (targetUser.role === "admin" || targetUser.role === "moderator")) {
      return res.status(403).json({ message: "Los moderadores no pueden suspender a admins o moderadores" });
    }
    // Update the same document instance
    targetUser.isSuspended = isSuspended;
    await targetUser.save();
    res.json({
      _id: targetUser._id,
      username: targetUser.username,
      email: targetUser.email,
      isSuspended: targetUser.isSuspended,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Moderators can block users (admin can override)
router.patch("/users/:id/block", moderationLimiter, verifyToken, requireModeratorOrAdmin, async (req, res) => {
  const { isBlocked } = req.body;
  if (typeof isBlocked !== "boolean") {
    return res.status(400).json({ message: "isBlocked debe ser boolean" });
  }
  try {
    const targetUser = await User.findById(req.params.id).select("role isBlocked");
    if (!targetUser) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    // Moderators cannot block admins or other moderators
    if (req.userRole === "moderator" && (targetUser.role === "admin" || targetUser.role === "moderator")) {
      return res.status(403).json({ message: "Los moderadores no pueden bloquear a admins o moderadores" });
    }
    // Update the same document instance
    targetUser.isBlocked = isBlocked;
    await targetUser.save();
    res.json({
      _id: targetUser._id,
      username: targetUser.username,
      email: targetUser.email,
      isBlocked: targetUser.isBlocked,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
