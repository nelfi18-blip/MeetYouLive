/**
 * Push notification routes.
 *
 * GET  /api/push/settings          – return current push settings for the user
 * PATCH /api/push/settings         – update push settings
 * POST /api/push/opened/:eventId   – mark a push notification as opened
 * GET  /api/push/analytics         – admin: aggregated analytics summary
 */

const { Router } = require("express");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const { requireAdmin } = require("../middlewares/admin.middleware.js");
const User = require("../models/User.js");
const PushEvent = require("../models/PushEvent.js");
const PushAnalytic = require("../models/PushAnalytic.js");

const router = Router();

const pushLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

// ── User settings ──────────────────────────────────────────────────────────

router.get("/settings", pushLimiter, verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("pushSettings").lean();
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    const settings = {
      enabled: user.pushSettings?.enabled !== false,
      categories: user.pushSettings?.categories?.length
        ? user.pushSettings.categories
        : ["match", "like", "live", "reward"],
    };
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

const ALLOWED_CATEGORIES = ["match", "like", "live", "reward"];

router.patch("/settings", pushLimiter, verifyToken, async (req, res) => {
  try {
    const { enabled, categories } = req.body;
    const updates = {};

    if (enabled !== undefined) {
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ message: "enabled debe ser un booleano" });
      }
      updates["pushSettings.enabled"] = enabled;
    }

    if (categories !== undefined) {
      if (!Array.isArray(categories)) {
        return res.status(400).json({ message: "categories debe ser un array" });
      }
      const invalid = categories.filter((c) => !ALLOWED_CATEGORIES.includes(c));
      if (invalid.length > 0) {
        return res.status(400).json({
          message: `Categorías no válidas: ${invalid.join(", ")}. Valores permitidos: ${ALLOWED_CATEGORIES.join(", ")}`,
        });
      }
      updates["pushSettings.categories"] = categories;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No se proporcionaron campos para actualizar" });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: updates },
      { new: true }
    ).select("pushSettings");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    res.json({
      enabled: user.pushSettings?.enabled !== false,
      categories: user.pushSettings?.categories || ALLOWED_CATEGORIES,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Open tracking ──────────────────────────────────────────────────────────

/**
 * Called by the service worker when the user taps a push notification.
 * No auth required — the eventId is hard to guess (24-char hex ObjectId).
 */
router.post("/opened/:eventId", pushLimiter, async (req, res) => {
  try {
    const { eventId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ message: "eventId inválido" });
    }

    const event = await PushEvent.findById(eventId).lean();
    if (!event) return res.status(404).json({ message: "Evento no encontrado" });

    if (!event.openedAt) {
      await PushEvent.updateOne({ _id: eventId }, { openedAt: new Date() });

      // Record analytics
      await PushAnalytic.create({
        userId: event.userId,
        pushEventId: event._id,
        type: event.type,
        action: "opened",
        metadata: {},
      }).catch(() => {});
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Analytics (admin) ──────────────────────────────────────────────────────

router.get("/analytics", pushLimiter, verifyToken, requireAdmin, async (req, res) => {
  try {
    const { from, to } = req.query;
    const matchFilter = {};
    if (from || to) {
      matchFilter.createdAt = {};
      if (from) matchFilter.createdAt.$gte = new Date(from);
      if (to) matchFilter.createdAt.$lte = new Date(to);
    }

    const [byAction, byType, conversionRate] = await Promise.all([
      // Totals per action
      PushAnalytic.aggregate([
        { $match: matchFilter },
        { $group: { _id: "$action", count: { $sum: 1 } } },
      ]),
      // Totals per type + action
      PushAnalytic.aggregate([
        { $match: matchFilter },
        { $group: { _id: { type: "$type", action: "$action" }, count: { $sum: 1 } } },
      ]),
      // CTR: opened / sent
      PushAnalytic.aggregate([
        { $match: matchFilter },
        {
          $group: {
            _id: null,
            sent: { $sum: { $cond: [{ $eq: ["$action", "sent"] }, 1, 0] } },
            opened: { $sum: { $cond: [{ $eq: ["$action", "opened"] }, 1, 0] } },
            converted: { $sum: { $cond: [{ $eq: ["$action", "converted"] }, 1, 0] } },
          },
        },
      ]),
    ]);

    const totals = conversionRate[0] || { sent: 0, opened: 0, converted: 0 };
    const ctr = totals.sent > 0 ? ((totals.opened / totals.sent) * 100).toFixed(1) : "0.0";
    const convRate =
      totals.opened > 0 ? ((totals.converted / totals.opened) * 100).toFixed(1) : "0.0";

    res.json({
      totals: {
        sent: totals.sent,
        opened: totals.opened,
        converted: totals.converted,
        ctr: `${ctr}%`,
        conversionRate: `${convRate}%`,
      },
      byAction: byAction.reduce((acc, r) => { acc[r._id] = r.count; return acc; }, {}),
      byType: byType.map((r) => ({ type: r._id.type, action: r._id.action, count: r.count })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
