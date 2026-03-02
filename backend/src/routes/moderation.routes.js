const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const { requireAdmin } = require("../middlewares/admin.middleware.js");
const Report = require("../models/Report.js");

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

router.get("/reports", moderationLimiter, verifyToken, requireAdmin, async (req, res) => {
  try {
    const reports = await Report.find({ status: "pending" })
      .populate("reporter", "username email")
      .sort({ createdAt: -1 });
    res.json(reports);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch("/reports/:id", moderationLimiter, verifyToken, requireAdmin, async (req, res) => {
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

module.exports = router;
