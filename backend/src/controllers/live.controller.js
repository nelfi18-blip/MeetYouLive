const crypto = require("crypto");
const Live = require("../models/Live.js");
const User = require("../models/User.js");
const Gift = require("../models/Gift.js");
const { getIO, hasLiveHost, getLiveEvent, setLiveEvent, clearLiveEvent } = require("../lib/socket.js");
const { sendMulticastPush } = require("../lib/fcm.js");
const { trackEvent } = require("../services/missions.service.js");

// Max followers to push on live start (to avoid very large batches)
const MAX_LIVE_PUSH_FOLLOWERS = 500;

const startLive = async (req, res) => {
  const { title, description, category, language, isPrivate, entryCost } = req.body;
  if (!title) return res.status(400).json({ message: "title es requerido" });

  let isApprovedCreator = false;
  let creatorUsername = "";
  let followerIds = [];
  try {
    const user = await User.findById(req.userId).select("role creatorStatus username name followers");
    if (!user) {
      return res.status(401).json({ message: "Usuario no encontrado" });
    }
    isApprovedCreator = user.role === "creator" && user.creatorStatus === "approved";
    creatorUsername = user.username || user.name || "";
    // Only approved creators can start live streams
    if (!isApprovedCreator) {
      return res.status(403).json({ message: "Solo los creadores aprobados pueden iniciar directos" });
    }
    followerIds = (user.followers || []).slice(0, MAX_LIVE_PUSH_FOLLOWERS);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }

  let costCoins = 0;
  if (isPrivate) {
    const parsed = Number(entryCost);
    costCoins = Number.isInteger(parsed) && parsed >= 1 ? parsed : 0;
  }

  try {
    const streamKey = crypto.randomBytes(16).toString("hex");
    const live = await Live.create({
      user: req.userId,
      title,
      description,
      category: category || "",
      language: language || "",
      streamKey,
      isLive: true,
      isPrivate: Boolean(isPrivate),
      entryCost: costCoins,
    });

    // Notify all connected users — client decides whether to display the toast.
    const io = getIO();
    if (io) {
      io.emit("LIVE_STARTED", {
        creatorId: String(req.userId),
        creatorUsername,
        liveId: String(live._id),
        title: live.title,
      });
    }

    // FCM push to followers (fire-and-forget, non-blocking)
    // Only followers who have "live" push notifications enabled receive this.
    if (followerIds.length > 0) {
      sendMulticastPush(
        followerIds,
        `🎥 ${creatorUsername || "Un creador"} está en vivo ahora`,
        live.title || "¡No te lo pierdas!",
        { link: `/live/${String(live._id)}` },
        "live"
      ).catch(() => {});
    }

    res.status(201).json(live);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const endLive = async (req, res) => {
  try {
    const live = await Live.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      { isLive: false, endedAt: new Date() },
      { new: true }
    );
    if (!live) return res.status(404).json({ message: "Live no encontrado" });

    // Notify all viewers in the live room that the stream has ended
    const io = getIO();
    if (io) {
      io.to(`live:${req.params.id}`).emit("LIVE_ENDED", { liveId: String(req.params.id) });
    }

    res.json(live);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getLives = async (req, res) => {
  try {
    const lives = await Live.find({ isLive: true })
      .populate("user", "username name avatar")
      .select("-streamKey -paidViewers")
      .sort({ createdAt: -1 })
      .lean();

    const sanitizedLives = (Array.isArray(lives) ? lives : [])
      .filter((live) => live && live._id && live.user)
      .filter((live) => hasLiveHost(String(live._id)))
      .map((live) => ({
        ...live,
        title: normalizeLiveTitle(live.title),
        description: typeof live.description === "string" ? live.description : "",
        viewerCount: Number.isFinite(live.viewerCount) ? Math.max(0, live.viewerCount) : 0,
        entryCost: Number.isFinite(live.entryCost) ? Math.max(0, live.entryCost) : 0,
      }));

    if (sanitizedLives.length > 0) {
      const liveIds = sanitizedLives.map((l) => l._id);
      const giftTotals = await Gift.aggregate([
        { $match: { live: { $in: liveIds } } },
        { $group: { _id: "$live", giftsTotal: { $sum: "$coinCost" }, giftsCount: { $sum: 1 } } },
      ]);
      const giftMap = {};
      for (const g of giftTotals) giftMap[String(g._id)] = g;

      for (const live of sanitizedLives) {
        const stats = giftMap[String(live._id)];
        live.giftsTotal = stats?.giftsTotal ?? 0;
        live.giftsCount = stats?.giftsCount ?? 0;
      }
    }

    res.json(sanitizedLives);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Helper that checks whether userId has access to a private live
const hasLiveAccess = (live, userId) => {
  if (!live.isPrivate) return true;
  if (!userId) return false;
  const creatorId = live.user._id ? live.user._id.toString() : live.user.toString();
  if (creatorId === userId.toString()) return true;
  return live.paidViewers.some((pv) => pv.toString() === userId.toString());
};

const getLiveById = async (req, res) => {
  try {
    const live = await Live.findOne({ _id: req.params.id, isLive: true }).populate("user", "username name avatar creatorProfile");
    if (!live) return res.status(404).json({ message: "Directo no encontrado o ya finalizado" });

    const access = hasLiveAccess(live, req.userId);
    const liveObj = live.toObject();
    delete liveObj.paidViewers;

    if (!access) {
      delete liveObj.streamKey;
      liveObj.hasAccess = false;
    } else {
      liveObj.hasAccess = true;
    }

    res.json(liveObj);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const joinLive = async (req, res) => {
  try {
    const live = await Live.findOne({ _id: req.params.id, isLive: true });
    if (!live) return res.status(404).json({ message: "Directo no encontrado o ya finalizado" });

    if (!live.isPrivate) {
      const liveObj = live.toObject();
      delete liveObj.paidViewers;
      liveObj.hasAccess = true;
      trackEvent(req.userId, "live_join").catch(() => {});
      return res.json(liveObj);
    }

    const creatorId = live.user.toString();
    if (creatorId === req.userId.toString()) {
      const liveObj = live.toObject();
      delete liveObj.paidViewers;
      liveObj.hasAccess = true;
      return res.json(liveObj);
    }

    // Check if already paid
    if (live.paidViewers.some((pv) => pv.toString() === req.userId.toString())) {
      const liveObj = live.toObject();
      delete liveObj.paidViewers;
      liveObj.hasAccess = true;
      trackEvent(req.userId, "live_join").catch(() => {});
      return res.json(liveObj);
    }

    // Deduct coins
    const user = await User.findById(req.userId);
    if (!user) return res.status(401).json({ message: "Usuario no encontrado" });
    if (user.coins < live.entryCost) {
      return res.status(402).json({ message: `Monedas insuficientes. Necesitas ${live.entryCost} monedas.` });
    }

    user.coins -= live.entryCost;
    await user.save();

    // Grant access — if this save fails, rollback the coin deduction
    live.paidViewers.push(req.userId);
    try {
      await live.save();
    } catch (saveErr) {
      user.coins += live.entryCost;
      await user.save().catch(() => {});
      return res.status(500).json({ message: "Error al registrar el acceso" });
    }

    // Also credit the creator
    if (live.entryCost > 0) {
      await User.findByIdAndUpdate(creatorId, { $inc: { earningsCoins: live.entryCost } });
    }

    const liveObj = live.toObject();
    delete liveObj.paidViewers;
    liveObj.hasAccess = true;
    trackEvent(req.userId, "live_join").catch(() => {});
    res.json(liveObj);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getMyLives = async (req, res) => {
  try {
    const lives = await Live.find({ user: req.userId })
      .sort({ createdAt: -1 });
    res.json(lives);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateLiveSettings = async (req, res) => {
  try {
    const { chatEnabled, giftsEnabled, isPrivate } = req.body;
    const update = {};
    if (typeof chatEnabled === "boolean") update.chatEnabled = chatEnabled;
    if (typeof giftsEnabled === "boolean") update.giftsEnabled = giftsEnabled;
    if (typeof isPrivate === "boolean") update.isPrivate = isPrivate;

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: "No hay cambios válidos para aplicar" });
    }

    const live = await Live.findOneAndUpdate(
      { _id: req.params.id, user: req.userId, isLive: true },
      update,
      { new: true }
    );
    if (!live) return res.status(404).json({ message: "Directo no encontrado, ya finalizado, o sin permisos" });

    const liveObj = live.toObject();
    delete liveObj.paidViewers;
    delete liveObj.streamKey;
    res.json(liveObj);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

function normalizeLiveTitle(title) {
  if (typeof title !== "string") return "Directo en vivo";
  const trimmed = title.trim();
  return trimmed || "Directo en vivo";
}

// ── Battle duration limits ───────────────────────────────────────────────────
const MIN_BATTLE_DURATION_MINUTES = 1;
const MAX_BATTLE_DURATION_MINUTES = 60;

// ── Goal endpoints ───────────────────────────────────────────────────────────

const getLiveGoal = async (req, res) => {
  try {
    const live = await Live.findOne({ _id: req.params.id, isLive: true }).select("goal").lean();
    if (!live) return res.status(404).json({ message: "Directo no encontrado" });
    res.json(live.goal || { active: false, title: "", target: 0, progress: 0, reward: "" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const setLiveGoal = async (req, res) => {
  try {
    const { title, target, reward } = req.body;
    const parsedTarget = Number(target);
    if (!title || !parsedTarget || parsedTarget < 1) {
      return res.status(400).json({ message: "title y target (>=1) son requeridos" });
    }
    const live = await Live.findOneAndUpdate(
      { _id: req.params.id, user: req.userId, isLive: true },
      { goal: { active: true, title: String(title).slice(0, 120), target: parsedTarget, progress: 0, reward: String(reward || "").slice(0, 120) } },
      { new: true }
    ).select("goal");
    if (!live) return res.status(404).json({ message: "Directo no encontrado o sin permisos" });
    const io = getIO();
    if (io) io.to(`live:${req.params.id}`).emit("LIVE_GOAL_UPDATED", { liveId: req.params.id, goal: live.goal });
    res.json(live.goal);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Battle endpoints ─────────────────────────────────────────────────────────

const getLiveBattle = async (req, res) => {
  try {
    const live = await Live.findOne({ _id: req.params.id, isLive: true }).select("battle").lean();
    if (!live) return res.status(404).json({ message: "Directo no encontrado" });
    res.json(live.battle || { active: false, title: "", leftLabel: "Equipo A", rightLabel: "Equipo B", leftScore: 0, rightScore: 0 });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const startLiveBattle = async (req, res) => {
  try {
    const { title, leftLabel, rightLabel, durationMinutes } = req.body;
    const durMins = Math.max(MIN_BATTLE_DURATION_MINUTES, Math.min(MAX_BATTLE_DURATION_MINUTES, Number(durationMinutes) || 5));
    const endsAt = new Date(Date.now() + durMins * 60 * 1000);
    const live = await Live.findOneAndUpdate(
      { _id: req.params.id, user: req.userId, isLive: true },
      {
        battle: {
          active: true,
          title: String(title || "Batalla").slice(0, 80),
          leftLabel: String(leftLabel || "Equipo A").slice(0, 40),
          rightLabel: String(rightLabel || "Equipo B").slice(0, 40),
          leftScore: 0,
          rightScore: 0,
          endsAt,
        },
      },
      { new: true }
    ).select("battle");
    if (!live) return res.status(404).json({ message: "Directo no encontrado o sin permisos" });
    const io = getIO();
    if (io) io.to(`live:${req.params.id}`).emit("BATTLE_STARTED", { liveId: req.params.id, battle: live.battle });
    res.json(live.battle);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const endLiveBattle = async (req, res) => {
  try {
    const live = await Live.findOneAndUpdate(
      { _id: req.params.id, user: req.userId, isLive: true },
      { "battle.active": false },
      { new: true }
    ).select("battle");
    if (!live) return res.status(404).json({ message: "Directo no encontrado o sin permisos" });
    const io = getIO();
    if (io) io.to(`live:${req.params.id}`).emit("BATTLE_ENDED", { liveId: req.params.id, battle: live.battle });
    res.json(live.battle);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// ── Live Events ──────────────────────────────────────────────────────────────

const ALLOWED_EVENT_TYPES = {
  x2_coins: { label: "🔥 ¡Evento x2 Coins! Envía regalos ahora", icon: "🔥", defaultDuration: 120 },
  last_boost: { label: "⏳ ¡Últimos 30 segundos! ¡Envía todo ahora!", icon: "⏳", defaultDuration: 60 },
  custom: { label: "🎉 ¡Evento especial en vivo!", icon: "🎉", defaultDuration: 90 },
};

const MAX_EVENT_DURATION_SECS = 600;

const triggerLiveEvent = async (req, res) => {
  try {
    const { type, label, durationSecs } = req.body;

    const cfg = ALLOWED_EVENT_TYPES[type];
    if (!cfg) {
      return res.status(400).json({ message: "Tipo de evento inválido. Usa: x2_coins, last_boost, custom" });
    }

    // Verify the requester owns this live and it's still active
    const live = await Live.findOne({ _id: req.params.id, user: req.userId, isLive: true }).select("_id").lean();
    if (!live) {
      return res.status(404).json({ message: "Directo no encontrado o sin permisos" });
    }

    const resolvedLabel = (type === "custom" && label && typeof label === "string")
      ? String(label).slice(0, 100)
      : cfg.label;
    const resolvedDuration = Math.min(
      MAX_EVENT_DURATION_SECS,
      Math.max(10, Number.isInteger(Number(durationSecs)) ? Number(durationSecs) : cfg.defaultDuration)
    );

    setLiveEvent(req.params.id, {
      type,
      label: resolvedLabel,
      icon: cfg.icon,
      durationSecs: resolvedDuration,
    });

    res.json({ type, label: resolvedLabel, icon: cfg.icon, durationSecs: resolvedDuration });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const stopLiveEvent = async (req, res) => {
  try {
    const live = await Live.findOne({ _id: req.params.id, user: req.userId, isLive: true }).select("_id").lean();
    if (!live) {
      return res.status(404).json({ message: "Directo no encontrado o sin permisos" });
    }
    clearLiveEvent(req.params.id);
    res.json({ message: "Evento finalizado" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getActiveLiveEvent = async (req, res) => {
  try {
    const ev = getLiveEvent(req.params.id);
    if (!ev) return res.json(null);
    res.json({
      type: ev.type,
      label: ev.label,
      icon: ev.icon,
      expiresAt: ev.expiresAt ? ev.expiresAt.toISOString() : null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { startLive, endLive, getLives, getLiveById, joinLive, getMyLives, updateLiveSettings, getLiveGoal, setLiveGoal, getLiveBattle, startLiveBattle, endLiveBattle, triggerLiveEvent, stopLiveEvent, getActiveLiveEvent };
