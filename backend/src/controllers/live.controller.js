const crypto = require("crypto");
const Live = require("../models/Live.js");
const User = require("../models/User.js");
const Gift = require("../models/Gift.js");
const { getIO } = require("../lib/socket.js");
const { sendMulticastPush } = require("../lib/fcm.js");

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
      .lean();

    if (lives.length > 0) {
      const liveIds = lives.map((l) => l._id);
      const giftTotals = await Gift.aggregate([
        { $match: { live: { $in: liveIds } } },
        { $group: { _id: "$live", giftsTotal: { $sum: "$coinCost" }, giftsCount: { $sum: 1 } } },
      ]);
      const giftMap = {};
      for (const g of giftTotals) giftMap[String(g._id)] = g;

      for (const live of lives) {
        const stats = giftMap[String(live._id)];
        live.giftsTotal = stats?.giftsTotal ?? 0;
        live.giftsCount = stats?.giftsCount ?? 0;
      }
    }

    res.json(lives);
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

module.exports = { startLive, endLive, getLives, getLiveById, joinLive, getMyLives, updateLiveSettings };
