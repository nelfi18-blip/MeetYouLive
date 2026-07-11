const crypto = require("crypto");
const mongoose = require("mongoose");
const Live = require("../models/Live.js");
const User = require("../models/User.js");
const Gift = require("../models/Gift.js");
const { STAFF_ROLES } = require("../middlewares/admin.middleware.js");
const {
  getIO,
  hasLiveHost,
  getLiveEvent,
  setLiveEvent,
  clearLiveEvent,
  clearAllEventsForLive,
  removeLiveUserFromRoom,
} = require("../lib/socket.js");
const { sendMulticastPush } = require("../lib/fcm.js");
const { trackEvent } = require("../services/missions.service.js");
const { createBulkNotifications } = require("../services/notification.service.js");
const { trackAnalyticsEvent } = require("../services/analytics.service.js");
const { isLiveActuallyActive, cleanupStaleLives, markLiveAsEnded, filterActiveLives } = require("../services/live.service.js");

// Max followers to push on live start (to avoid very large batches)
const MAX_LIVE_PUSH_FOLLOWERS = 500;
const MAX_LIVE_MODERATION_REASON_LENGTH = 200;
const MAX_LIVE_MODERATION_ACTIONS = 200;

function removePrivateLiveFields(liveObj) {
  if (!liveObj) return liveObj;
  const { paidViewers, bannedUsers, moderationActions, ...safeLiveObj } = liveObj;
  return safeLiveObj;
}

function sanitizeLiveModerationReason(reason) {
  return typeof reason === "string" ? reason.trim().slice(0, MAX_LIVE_MODERATION_REASON_LENGTH) : "";
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

const startLive = async (req, res) => {
  const { title, description, category, language, isPrivate, entryCost, isVipOnly } = req.body;
  if (!title) return res.status(400).json({ message: "title es requerido" });

  let isApprovedCreator = false;
  let creatorUsername = "";
  let followerIds = [];
  try {
    const user = await User.findById(req.userId).select("role creatorStatus username name followers");
    if (!user) {
      return res.status(401).json({ message: "Usuario no encontrado" });
    }
    isApprovedCreator = (user.role === "creator" || user.role === "subCreator") && user.creatorStatus === "approved";
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
      isVipOnly: Boolean(isVipOnly),
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

      // Persisted in-app notifications for followers (fire-and-forget)
      createBulkNotifications(followerIds, {
        type: "live",
        title: "🔴 Live activo",
        message: `${creatorUsername || "Un creador"} está en vivo ahora`,
        data: { liveId: String(live._id), creatorId: String(req.userId) },
      });
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

    // Analytics: live_duration (fire-and-forget)
    const durationSeconds = live.endedAt && live.createdAt
      ? Math.max(0, Math.round((live.endedAt - live.createdAt) / 1000))
      : 0;
    trackAnalyticsEvent("live_duration", String(live.user), {
      liveId: String(live._id),
      durationSeconds,
    });

    // Clean up all live events and timers to prevent memory leaks
    clearAllEventsForLive(req.params.id);

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
    // First, cleanup any stale lives (runs in background, non-blocking)
    cleanupStaleLives().catch((err) => {
      console.error("Background stale live cleanup failed:", err);
    });

    const lives = await Live.find({ isLive: true, endedAt: null })
      .populate("user", "username name avatar role creatorStatus")
      .select("-streamKey -paidViewers -bannedUsers -moderationActions")
      .sort({ createdAt: -1 })
      .lean();

    // Apply active live filter FIRST to ensure only truly active streams
    const activeLives = filterActiveLives(lives);

    // Filter out lives from admin/moderator users AND validate they're actually active
    const sanitizedLives = activeLives
      .filter((live) => live && live._id && live.user)
      .filter((live) => {
        // Exclude admin and moderator streamers from public explore
        const userRole = live.user?.role;
        return userRole !== "admin" && userRole !== "moderator";
      })
      .filter((live) => {
        // CRITICAL: Validate live is actually active (not stale/ghost)
        return isLiveActuallyActive(live);
      })
      .filter((live) => hasLiveHost(String(live._id)))
      .map((live) => {
        // Remove role from user object before sending to client
        const { role, ...userWithoutRole } = live.user || {};
        return {
          ...live,
          user: userWithoutRole,
          title: normalizeLiveTitle(live.title),
          description: typeof live.description === "string" ? live.description : "",
          viewerCount: Number.isFinite(live.viewerCount) ? Math.max(0, live.viewerCount) : 0,
          entryCost: Number.isFinite(live.entryCost) ? Math.max(0, live.entryCost) : 0,
        };
      });

    if (sanitizedLives.length > 0) {
      const liveIds = sanitizedLives.map((l) => l._id);
      const giftTotals = await Gift.aggregate([
        { $match: { live: { $in: liveIds } } },
        { $group: { _id: "$live", giftsTotal: { $sum: "$coinCost" }, giftsCount: { $sum: 1 } } },
      ]);
      const giftMap = {};
      for (const g of giftTotals) giftMap[String(g._id)] = g;

      // Calculate trending status based on engagement metrics
      // A live is trending if: viewer count >= 10 OR coins earned >= 500
      const TRENDING_VIEWER_THRESHOLD = 10;
      const TRENDING_COINS_THRESHOLD = 500;

      for (const live of sanitizedLives) {
        const stats = giftMap[String(live._id)];
        const totalCoinsEarned = stats?.giftsTotal ?? 0;
        const viewerCount = live.viewerCount || 0;

        live.giftsTotal = totalCoinsEarned;
        live.giftsCount = stats?.giftsCount ?? 0;
        live.totalCoinsEarned = totalCoinsEarned;
        
        // Determine trending status
        live.isTrending = viewerCount >= TRENDING_VIEWER_THRESHOLD || totalCoinsEarned >= TRENDING_COINS_THRESHOLD;
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

// Helper that checks whether userId has VIP-only access to a live stream
const hasVipAccess = async (live, userId) => {
  if (!live.isVipOnly) return true;
  if (!userId) return false;
  const creatorId = live.user._id ? live.user._id.toString() : live.user.toString();
  if (creatorId === userId.toString()) return true;
  const user = await User.findById(userId).select("isVIP").lean();
  return !!(user && user.isVIP);
};

const getLiveById = async (req, res) => {
  try {
    const live = await Live.findOne({ _id: req.params.id, isLive: true }).populate("user", "username name avatar creatorProfile role");
    if (!live) return res.status(404).json({ message: "Directo no encontrado o ya finalizado" });
    
    // Validate the live is actually active (not stale)
    if (!isLiveActuallyActive(live)) {
      // Mark it as ended if it's stale
      await markLiveAsEnded(req.params.id);
      return res.status(404).json({ message: "Directo no encontrado o ya finalizado" });
    }
    
    // Hide staff lives from public
    if (STAFF_ROLES.includes(live.user.role)) {
      return res.status(404).json({ message: "Directo no encontrado o ya finalizado" });
    }

    if (
      req.userId &&
      String(live.user._id) !== String(req.userId) &&
      live.bannedUsers.some((userId) => String(userId) === String(req.userId))
    ) {
      return res.status(403).json({ message: "No puedes entrar a este directo" });
    }

    const access = hasLiveAccess(live, req.userId);
    const vipAccess = await hasVipAccess(live, req.userId);
    const liveObj = removePrivateLiveFields(live.toObject());
    
    // Remove role from user object
    if (liveObj.user && liveObj.user.role) {
      delete liveObj.user.role;
    }

    if (!access) {
      delete liveObj.streamKey;
      liveObj.hasAccess = false;
    } else if (!vipAccess) {
      delete liveObj.streamKey;
      liveObj.hasAccess = true;
      liveObj.hasVipAccess = false;
    } else {
      liveObj.hasAccess = true;
      liveObj.hasVipAccess = true;
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

    // Validate the live is actually active (not stale)
    if (!isLiveActuallyActive(live)) {
      // Mark it as ended if it's stale
      await markLiveAsEnded(req.params.id);
      return res.status(404).json({ message: "Directo no encontrado o ya finalizado" });
    }

    if (live.bannedUsers.some((userId) => String(userId) === String(req.userId))) {
      return res.status(403).json({ message: "No puedes entrar a este directo" });
    }

    if (!live.isPrivate) {
      const liveObj = removePrivateLiveFields(live.toObject());
      liveObj.hasAccess = true;
      trackEvent(req.userId, "live_join").catch(() => {});
      trackAnalyticsEvent("live_joined", String(req.userId), { liveId: req.params.id });
      return res.json(liveObj);
    }

    const creatorId = live.user.toString();
    if (creatorId === req.userId.toString()) {
      const liveObj = removePrivateLiveFields(live.toObject());
      liveObj.hasAccess = true;
      return res.json(liveObj);
    }

    // Check if already paid
    if (live.paidViewers.some((pv) => pv.toString() === req.userId.toString())) {
      const liveObj = removePrivateLiveFields(live.toObject());
      liveObj.hasAccess = true;
      trackEvent(req.userId, "live_join").catch(() => {});
      trackAnalyticsEvent("live_joined", String(req.userId), { liveId: req.params.id });
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

    const liveObj = removePrivateLiveFields(live.toObject());
    liveObj.hasAccess = true;
    trackEvent(req.userId, "live_join").catch(() => {});
    trackAnalyticsEvent("live_joined", String(req.userId), { liveId: req.params.id });
    res.json(liveObj);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getMyLives = async (req, res) => {
  try {
    const lives = await Live.find({ user: req.userId })
      .select("-bannedUsers -moderationActions")
      .sort({ createdAt: -1 });
    res.json(lives);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateLiveSettings = async (req, res) => {
  try {
    const { chatEnabled, giftsEnabled, isPrivate, isVipOnly } = req.body;
    const update = {};
    if (typeof chatEnabled === "boolean") update.chatEnabled = chatEnabled;
    if (typeof giftsEnabled === "boolean") update.giftsEnabled = giftsEnabled;
    if (typeof isPrivate === "boolean") update.isPrivate = isPrivate;
    if (typeof isVipOnly === "boolean") update.isVipOnly = isVipOnly;

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: "No hay cambios válidos para aplicar" });
    }

    const live = await Live.findOneAndUpdate(
      { _id: req.params.id, user: req.userId, isLive: true },
      update,
      { new: true }
    );
    if (!live) return res.status(404).json({ message: "Directo no encontrado, ya finalizado, o sin permisos" });

    const liveObj = removePrivateLiveFields(live.toObject());
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

// ── Multi-guest management (Tango-style) ────────────────────────────────────

const requestJoinLive = async (req, res) => {
  try {
    const live = await Live.findOne({ _id: req.params.id, isLive: true });
    if (!live) return res.status(404).json({ message: "Directo no encontrado o ya finalizado" });

    const creatorId = String(live.user);
    const requesterId = String(req.userId);

    // Cannot request if you are the creator
    if (creatorId === requesterId) {
      return res.status(400).json({ message: "El creador no puede solicitar unirse" });
    }

    // Check if already a guest
    const isGuest = live.guests.some((g) => String(g.userId) === requesterId);
    if (isGuest) {
      return res.status(400).json({ message: "Ya eres un invitado en este directo" });
    }

    // Check if already requested
    const hasRequest = live.guestRequests.some((r) => String(r.userId) === requesterId && r.status === "pending");
    if (hasRequest) {
      return res.status(400).json({ message: "Ya has enviado una solicitud pendiente" });
    }

    // Check max guests limit
    const activeGuests = live.guests.filter((g) => g.status === "active");
    if (activeGuests.length >= live.maxGuests) {
      return res.status(400).json({ message: "El directo ya tiene el máximo de invitados" });
    }

    // Add request
    live.guestRequests.push({ userId: requesterId, status: "pending" });
    await live.save();

    // Notify host via socket
    const io = getIO();
    if (io) {
      const user = await User.findById(requesterId).select("username name").lean();
      io.to(creatorId).emit("GUEST_REQUEST_RECEIVED", {
        liveId: req.params.id,
        userId: requesterId,
        username: user?.username || user?.name || "Usuario",
      });
    }

    res.json({ message: "Solicitud enviada al creador" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const approveGuest = async (req, res) => {
  try {
    const { guestUserId } = req.body;
    if (!guestUserId) return res.status(400).json({ message: "guestUserId es requerido" });

    const live = await Live.findOne({ _id: req.params.id, user: req.userId, isLive: true });
    if (!live) return res.status(404).json({ message: "Directo no encontrado o sin permisos" });

    // Check max guests limit
    const activeGuests = live.guests.filter((g) => g.status === "active");
    if (activeGuests.length >= live.maxGuests) {
      return res.status(400).json({ message: "El directo ya tiene el máximo de invitados" });
    }

    // Find and update the request
    const request = live.guestRequests.find((r) => String(r.userId) === String(guestUserId) && r.status === "pending");
    if (!request) {
      return res.status(404).json({ message: "Solicitud no encontrada o ya procesada" });
    }

    request.status = "approved";

    // Add to guests
    const alreadyGuest = live.guests.some((g) => String(g.userId) === String(guestUserId));
    if (!alreadyGuest) {
      live.guests.push({ userId: guestUserId, status: "active" });
    }

    await live.save();

    // Notify the approved guest and broadcast to the room
    const io = getIO();
    if (io) {
      const user = await User.findById(guestUserId).select("username name avatar").lean();
      const guestData = {
        userId: String(guestUserId),
        username: user?.username || user?.name || "Invitado",
        avatar: user?.avatar || "",
      };

      // Notify the guest
      io.to(String(guestUserId)).emit("GUEST_APPROVED", {
        liveId: req.params.id,
      });

      // Broadcast to all viewers in the room
      io.to(`live:${req.params.id}`).emit("GUEST_JOINED", {
        liveId: req.params.id,
        guest: guestData,
      });
    }

    res.json({ message: "Invitado aprobado" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const declineGuest = async (req, res) => {
  try {
    const { guestUserId } = req.body;
    if (!guestUserId) return res.status(400).json({ message: "guestUserId es requerido" });

    const live = await Live.findOne({ _id: req.params.id, user: req.userId, isLive: true });
    if (!live) return res.status(404).json({ message: "Directo no encontrado o sin permisos" });

    const request = live.guestRequests.find((r) => String(r.userId) === String(guestUserId) && r.status === "pending");
    if (!request) {
      return res.status(404).json({ message: "Solicitud no encontrada o ya procesada" });
    }

    request.status = "declined";
    await live.save();

    // Notify the declined guest
    const io = getIO();
    if (io) {
      io.to(String(guestUserId)).emit("GUEST_DECLINED", {
        liveId: req.params.id,
      });
    }

    res.json({ message: "Solicitud rechazada" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const leaveAsGuest = async (req, res) => {
  try {
    const live = await Live.findOne({ _id: req.params.id, isLive: true });
    if (!live) return res.status(404).json({ message: "Directo no encontrado o ya finalizado" });

    const guestIndex = live.guests.findIndex((g) => String(g.userId) === String(req.userId));
    if (guestIndex === -1) {
      return res.status(404).json({ message: "No eres un invitado en este directo" });
    }

    // Remove guest
    live.guests.splice(guestIndex, 1);
    await live.save();

    // Broadcast to all viewers in the room
    const io = getIO();
    if (io) {
      io.to(`live:${req.params.id}`).emit("GUEST_LEFT", {
        liveId: req.params.id,
        userId: String(req.userId),
      });
    }

    res.json({ message: "Has salido como invitado" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const removeGuest = async (req, res) => {
  try {
    const { guestUserId } = req.params;
    if (!guestUserId) return res.status(400).json({ message: "guestUserId es requerido" });

    const live = await Live.findOne({ _id: req.params.id, user: req.userId, isLive: true });
    if (!live) return res.status(404).json({ message: "Directo no encontrado o sin permisos" });

    const guestIndex = live.guests.findIndex((g) => String(g.userId) === String(guestUserId));
    if (guestIndex === -1) {
      return res.status(404).json({ message: "Invitado no encontrado" });
    }

    // Remove guest
    live.guests.splice(guestIndex, 1);
    await live.save();

    // Notify the removed guest and broadcast to the room
    const io = getIO();
    if (io) {
      io.to(String(guestUserId)).emit("GUEST_REMOVED", {
        liveId: req.params.id,
      });

      io.to(`live:${req.params.id}`).emit("GUEST_LEFT", {
        liveId: req.params.id,
        userId: String(guestUserId),
      });
    }

    res.json({ message: "Invitado removido" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const moderateLiveUser = async (req, res) => {
  try {
    const { action } = req.params;
    const { targetUserId, reason } = req.body;

    if (!["kick", "ban"].includes(action)) {
      return res.status(400).json({ message: "Acción inválida" });
    }
    if (!isValidObjectId(req.params.id) || !isValidObjectId(targetUserId)) {
      return res.status(400).json({ message: "IDs inválidos" });
    }
    if (String(targetUserId) === String(req.userId)) {
      return res.status(400).json({ message: "No puedes moderarte a ti mismo" });
    }

    const [live, targetUser] = await Promise.all([
      Live.findOne({ _id: req.params.id, user: req.userId, isLive: true }),
      User.findById(targetUserId).select("_id username name").lean(),
    ]);

    if (!live) {
      return res.status(404).json({ message: "Directo no encontrado o sin permisos" });
    }
    if (!targetUser) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const normalizedReason = sanitizeLiveModerationReason(reason);
    const targetId = String(targetUser._id);
    const duplicateAction = live.moderationActions.some(
      (entry) =>
        String(entry.target) === targetId &&
        entry.action === action &&
        (entry.reason || "") === normalizedReason
    );

    live.guests = live.guests.filter((guest) => String(guest.userId) !== targetId);
    live.guestRequests = live.guestRequests.filter((request) => String(request.userId) !== targetId);
    if (action === "ban") {
      const bannedUserIds = new Set(live.bannedUsers.map((userId) => String(userId)));
      bannedUserIds.add(targetId);
      live.bannedUsers = Array.from(bannedUserIds);
    }
    if (!duplicateAction) {
      live.moderationActions.push({
        moderator: req.userId,
        target: targetUser._id,
        action,
        reason: normalizedReason,
      });
    }
    if (live.moderationActions.length > MAX_LIVE_MODERATION_ACTIONS) {
      live.moderationActions = live.moderationActions.slice(-MAX_LIVE_MODERATION_ACTIONS);
    }
    await live.save();

    const payload = {
      liveId: String(live._id),
      targetUserId: String(targetUser._id),
      action,
    };
    await removeLiveUserFromRoom(String(live._id), String(targetUser._id), payload);
    const io = getIO();
    if (io) {
      // initSocket() joins authenticated users to their raw userId room for existing notification emitters.
      io.to(String(targetUser._id)).emit("LIVE_USER_MODERATED", payload);
      io.to(`live:${live._id}`).emit("LIVE_USER_REMOVED", payload);
      // Reuse the existing guest event so guest/video panels clear removed participants.
      io.to(`live:${live._id}`).emit("GUEST_LEFT", {
        liveId: String(live._id),
        userId: String(targetUser._id),
      });
    }

    return res.json({
      ok: true,
      liveId: String(live._id),
      targetUserId: String(targetUser._id),
      action,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const getGuests = async (req, res) => {
  try {
    const live = await Live.findOne({ _id: req.params.id, isLive: true })
      .select("guests guestRequests user")
      .populate("guests.userId", "username name avatar")
      .populate("guestRequests.userId", "username name avatar")
      .lean();

    if (!live) return res.status(404).json({ message: "Directo no encontrado" });

    // Only the host can see pending requests
    const isHost = String(live.user) === String(req.userId);
    const response = {
      guests: live.guests || [],
      guestRequests: isHost ? (live.guestRequests || []).filter((r) => r.status === "pending") : [],
    };

    res.json(response);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── VS Battle system ────────────────────────────────────────────────────────

const startVsBattle = async (req, res) => {
  try {
    const { opponentLiveId, durationMinutes } = req.body;
    
    if (!opponentLiveId) {
      return res.status(400).json({ message: "opponentLiveId es requerido" });
    }
    
    if (!mongoose.Types.ObjectId.isValid(opponentLiveId)) {
      return res.status(400).json({ message: "opponentLiveId inválido" });
    }
    
    if (!durationMinutes || durationMinutes < 1 || durationMinutes > 60) {
      return res.status(400).json({ message: "durationMinutes debe estar entre 1 y 60" });
    }
    
    const hostLive = await Live.findOne({ _id: req.params.id, user: req.userId, isLive: true });
    if (!hostLive) {
      return res.status(404).json({ message: "Directo no encontrado o sin permisos" });
    }
    
    if (hostLive.isVsActive) {
      return res.status(400).json({ message: "Ya tienes una batalla activa" });
    }
    
    const opponentLive = await Live.findOne({ _id: opponentLiveId, isLive: true });
    if (!opponentLive) {
      return res.status(404).json({ message: "Directo oponente no encontrado o no está en vivo" });
    }
    
    if (opponentLive.isVsActive) {
      return res.status(400).json({ message: "El oponente ya tiene una batalla activa" });
    }
    
    if (String(hostLive._id) === String(opponentLive._id)) {
      return res.status(400).json({ message: "No puedes iniciar una batalla contigo mismo" });
    }
    
    const vsStartTime = new Date();
    const vsDuration = durationMinutes * 60; // Convert to seconds
    
    // Update both lives to activate VS battle
    hostLive.isVsActive = true;
    hostLive.opponentId = opponentLive._id;
    hostLive.vsStartTime = vsStartTime;
    hostLive.vsDuration = vsDuration;
    hostLive.vsScore = { host: 0, opponent: 0 };
    
    opponentLive.isVsActive = true;
    opponentLive.opponentId = hostLive._id;
    opponentLive.vsStartTime = vsStartTime;
    opponentLive.vsDuration = vsDuration;
    opponentLive.vsScore = { host: 0, opponent: 0 };
    
    await Promise.all([hostLive.save(), opponentLive.save()]);
    
    // Emit VS battle started to both rooms
    const io = getIO();
    if (io) {
      const [hostUser, opponentUser] = await Promise.all([
        User.findById(hostLive.user).select("username name").lean(),
        User.findById(opponentLive.user).select("username name").lean(),
      ]);
      
      const battleData = {
        vsStartTime: vsStartTime.toISOString(),
        vsDuration,
        hostLiveId: String(hostLive._id),
        hostUsername: hostUser?.username || hostUser?.name || "Host",
        opponentLiveId: String(opponentLive._id),
        opponentUsername: opponentUser?.username || opponentUser?.name || "Oponente",
      };
      
      io.to(`live:${hostLive._id}`).emit("vs_battle_started", {
        ...battleData,
        role: "host",
      });
      
      io.to(`live:${opponentLive._id}`).emit("vs_battle_started", {
        ...battleData,
        role: "opponent",
      });
    }
    
    // Schedule automatic battle end
    // NOTE: setTimeout is used for simplicity but will be lost on server restart.
    // For production use, implement a job queue (e.g., Bull) or periodic check on server startup
    // to handle battles that should have ended while the server was down.
    const endTime = vsStartTime.getTime() + (vsDuration * 1000);
    const delay = endTime - Date.now();
    
    if (delay > 0) {
      setTimeout(() => {
        endVsBattleAutomatically(String(hostLive._id), String(opponentLive._id));
      }, delay);
    } else {
      // If delay is negative (battle should have already ended), end it immediately
      // This can happen if database operations are slow or system time changed
      endVsBattleAutomatically(String(hostLive._id), String(opponentLive._id)).catch(() => {});
    }
    
    res.json({
      message: "Batalla VS iniciada",
      vsStartTime,
      vsDuration,
      opponentLiveId: String(opponentLive._id),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Helper function to automatically end VS battle when time expires
const endVsBattleAutomatically = async (hostLiveId, opponentLiveId) => {
  try {
    const [hostLive, opponentLive] = await Promise.all([
      Live.findById(hostLiveId),
      Live.findById(opponentLiveId),
    ]);
    
    if (!hostLive || !opponentLive) return;
    if (!hostLive.isVsActive || !opponentLive.isVsActive) return;
    
    // Determine winner based on scores
    const hostScore = hostLive.vsScore?.host || 0;
    const opponentScore = hostLive.vsScore?.opponent || 0;
    
    let winner = "tie";
    if (hostScore > opponentScore) {
      winner = "host";
    } else if (opponentScore > hostScore) {
      winner = "opponent";
    }
    
    // Reset VS battle state for both lives
    hostLive.isVsActive = false;
    hostLive.opponentId = null;
    hostLive.vsStartTime = null;
    hostLive.vsDuration = 0;
    hostLive.vsScore = { host: 0, opponent: 0 };
    
    opponentLive.isVsActive = false;
    opponentLive.opponentId = null;
    opponentLive.vsStartTime = null;
    opponentLive.vsDuration = 0;
    opponentLive.vsScore = { host: 0, opponent: 0 };
    
    await Promise.all([hostLive.save(), opponentLive.save()]);
    
    // Emit VS result to both rooms
    const io = getIO();
    if (io) {
      const [hostUser, opponentUser] = await Promise.all([
        User.findById(hostLive.user).select("username name").lean(),
        User.findById(opponentLive.user).select("username name").lean(),
      ]);
      
      io.to(`live:${hostLiveId}`).emit("vs_result", {
        winner,
        hostScore,
        opponentScore,
        hostUsername: hostUser?.username || hostUser?.name || "Host",
        opponentUsername: opponentUser?.username || opponentUser?.name || "Oponente",
      });
      
      io.to(`live:${opponentLiveId}`).emit("vs_result", {
        winner: winner === "host" ? "opponent" : (winner === "opponent" ? "host" : "tie"),
        hostScore: opponentScore,
        opponentScore: hostScore,
        hostUsername: opponentUser?.username || opponentUser?.name || "Oponente",
        opponentUsername: hostUser?.username || hostUser?.name || "Host",
      });
    }
  } catch (err) {
    console.error("[VS Battle] Auto-end failed:", err);
  }
};

module.exports = { startLive, endLive, getLives, getLiveById, joinLive, getMyLives, updateLiveSettings, getLiveGoal, setLiveGoal, getLiveBattle, startLiveBattle, endLiveBattle, triggerLiveEvent, stopLiveEvent, getActiveLiveEvent, requestJoinLive, approveGuest, declineGuest, leaveAsGuest, removeGuest, moderateLiveUser, getGuests, startVsBattle };
