const mongoose = require("mongoose");
const AIModerationSignal = require("../models/AIModerationSignal.js");
const { logStaffAction } = require("../services/audit.service.js");

const ALLOWED_STATUSES = ["pending", "reviewed", "dismissed"];
const REVIEW_STATUSES = ["reviewed", "dismissed"];

/**
 * List AI moderation signals for staff review. Defaults to pending signals.
 * This endpoint never exposes original message text or raw provider
 * payloads: only the minimal metadata persisted on AIModerationSignal.
 */
async function listAIModerationSignals(req, res) {
  try {
    // Resolve the query value against a fixed allowlist and use the
    // matched allowlist literal (never the raw client string) in the query.
    const requestedStatus = typeof req.query.status === "string" ? req.query.status : null;
    const matchedStatus = ALLOWED_STATUSES.find((allowed) => allowed === requestedStatus);
    const filter = { status: matchedStatus || "pending" };

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
  const requestedStatus = typeof req.body.status === "string" ? req.body.status : null;
  const status = REVIEW_STATUSES.find((allowed) => allowed === requestedStatus);
  if (!status) {
    return res.status(400).json({ ok: false, message: "Estado inválido. Usa: reviewed o dismissed" });
  }
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ ok: false, message: "ID de señal inválido" });
  }
  const signalId = new mongoose.Types.ObjectId(req.params.id);

  try {
    const signal = await AIModerationSignal.findByIdAndUpdate(
      signalId,
      {
        // `status` is one of the fixed REVIEW_STATUSES literals matched
        // above, never the raw client string.
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
      targetId: signalId,
      details: { newStatus: status, riskLevel: signal.riskLevel, categories: signal.categories },
      ipAddress: req.ip,
    });

    return res.json({ ok: true, signal });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
}

module.exports = { listAIModerationSignals, updateAIModerationSignalStatus };
