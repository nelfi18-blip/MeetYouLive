const crypto = require("crypto");
const Live = require("../models/Live.js");
const User = require("../models/User.js");

const startLive = async (req, res) => {
  const { title, description, category, language, isPrivate, entryCost } = req.body;
  if (!title) return res.status(400).json({ message: "title es requerido" });

  try {
    const user = await User.findById(req.userId).select("role creatorStatus");
    if (!user || user.role !== "creator" || user.creatorStatus !== "approved") {
      return res.status(403).json({ message: "Solo los creadores aprobados pueden iniciar transmisiones" });
    }
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
    const lives = await Live.find({ isLive: true }).populate("user", "username name").select("-streamKey -paidViewers");
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
    const live = await Live.findOne({ _id: req.params.id, isLive: true }).populate("user", "username name");
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

module.exports = { startLive, endLive, getLives, getLiveById, joinLive, getMyLives };
