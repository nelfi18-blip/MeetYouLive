const mongoose = require("mongoose");
const AIModerationSignal = require("../models/AIModerationSignal.js");
const { logStaffAction } = require("../services/audit.service.js");

const ALLOWED_STATUSES = ["pending", "reviewed", "dismissed"];

/**
 * List AI moderation signals for staff review. Defaults to pending signals.
 * This endpoint never exposes original message text or raw provider
 * payloads: only the minimal metadata persisted on AIModerationSignal.
 */
async function listAIModerationSignals(req, res) {
  try {
    const filter = {};
    if (req.query.status && ALLOWED_STATUSES.includes(req.query.status)) {
      filter.status = req.query.status;
    } else {
      filter.status = "pending";
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const [signals, total] = await Promise.all([
      AIModerationSignal.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AIModerationSignal.countDocuments(filter),
    ]);

    return res.json({ ok: true, signals, total, page, limit });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
}

/**
 * Marks an AI moderation signal as `reviewed` or `dismissed`. This action is
 * purely a record of human review; it never bans, suspends, blocks, deletes,
 * or otherwise enforces anything against the signal's author. Enforcement
 * (if any) must go through the existing Report/User moderation endpoints.
 */
async function updateAIModerationSignalStatus(req, res) {
  const { status } = req.body;
  if (!["reviewed", "dismissed"].includes(status)) {
    return res.status(400).json({ ok: false, message: "Estado inválido. Usa: reviewed o dismissed" });
  }
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ ok: false, message: "ID de señal inválido" });
  }

  try {
    const signal = await AIModerationSignal.findByIdAndUpdate(
      req.params.id,
      {
        status,
        // reviewedBy always comes from the authenticated staff identity,
        // never from client-supplied input.
        reviewedBy: req.userId,
        reviewedAt: new Date(),
      },
      { new: true }
    );
    if (!signal) return res.status(404).json({ ok: false, message: "Señal no encontrada" });

    await logStaffAction({
      staffId: req.userId,
      staffRole: req.userRole,
      action: "update_ai_moderation_signal",
      targetType: "AIModerationSignal",
      targetId: req.params.id,
      details: { newStatus: status, riskLevel: signal.riskLevel, categories: signal.categories },
      ipAddress: req.ip,
    });

    return res.json({ ok: true, signal });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
}

module.exports = { listAIModerationSignals, updateAIModerationSignalStatus };
