const mongoose = require("mongoose");
const ExclusiveContent = require("../models/ExclusiveContent.js");
const ExclusiveUnlock = require("../models/ExclusiveUnlock.js");
const User = require("../models/User.js");
const CoinTransaction = require("../models/CoinTransaction.js");

// 60% goes to the creator, 40% is the platform commission
const COMMISSION_RATE = 0.40;

// GET /api/exclusive – list all published exclusive content
const listContent = async (req, res) => {
  try {
    const content = await ExclusiveContent.find({ isPublished: true })
      .populate("creator", "username name avatar")
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(content);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/exclusive/mine – creator's own exclusive content
const myContent = async (req, res) => {
  try {
    const content = await ExclusiveContent.find({ creator: req.userId })
      .sort({ createdAt: -1 });
    res.json(content);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/exclusive – creator uploads exclusive content metadata
const createContent = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || user.role !== "creator" || user.creatorStatus !== "approved") {
      return res.status(403).json({ message: "Solo los creadores aprobados pueden publicar contenido exclusivo" });
    }

    const { title, description, thumbnailUrl, contentUrl, coinPrice } = req.body;
    if (!title || !contentUrl) {
      return res.status(400).json({ message: "title y contentUrl son requeridos" });
    }
    const parsedPrice = Number(coinPrice);
    if (isNaN(parsedPrice) || parsedPrice < 1) {
      return res.status(400).json({ message: "coinPrice debe ser al menos 1" });
    }

    const content = await ExclusiveContent.create({
      creator: req.userId,
      title: title.trim(),
      description: description ? description.trim() : "",
      thumbnailUrl: thumbnailUrl ? thumbnailUrl.trim() : "",
      contentUrl: contentUrl.trim(),
      coinPrice: parsedPrice,
    });
    await content.populate("creator", "username name avatar");
    res.status(201).json(content);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/exclusive/:id – get content by id (contentUrl hidden unless access granted)
const getContent = async (req, res) => {
  try {
    const content = await ExclusiveContent.findById(req.params.id)
      .populate("creator", "username name avatar");
    if (!content || !content.isPublished) {
      return res.status(404).json({ message: "Contenido no encontrado" });
    }

    let hasAccess = false;
    if (req.userId) {
      if (String(content.creator._id) === String(req.userId)) {
        hasAccess = true; // Creator always has access to their own content
      } else {
        const unlock = await ExclusiveUnlock.findOne({ user: req.userId, content: content._id });
        hasAccess = !!unlock;
      }
    }

    const response = content.toObject();
    if (!hasAccess) {
      delete response.contentUrl;
    }
    response.hasAccess = hasAccess;
    res.json(response);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/exclusive/:id/unlock – user unlocks content with coins (60/40 split)
const unlockContent = async (req, res) => {
  let contentDoc;
  let creatorShare;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      contentDoc = await ExclusiveContent.findById(req.params.id).session(session);
      if (!contentDoc || !contentDoc.isPublished) {
        throw Object.assign(new Error("Contenido no encontrado"), { status: 404 });
      }
      if (String(contentDoc.creator) === String(req.userId)) {
        throw Object.assign(new Error("No puedes desbloquear tu propio contenido"), { status: 400 });
      }

      const existing = await ExclusiveUnlock.findOne({
        user: req.userId,
        content: contentDoc._id,
      }).session(session);
      if (existing) {
        throw Object.assign(new Error("Ya tienes acceso a este contenido"), { status: 400 });
      }

      const amount = contentDoc.coinPrice;
      creatorShare = Math.floor(amount * (1 - COMMISSION_RATE));
      const platformShare = amount - creatorShare;

      const buyer = await User.findById(req.userId).session(session);
      if (!buyer || buyer.coins < amount) {
        throw Object.assign(new Error("Monedas insuficientes"), { status: 400 });
      }

      await User.findByIdAndUpdate(req.userId, { $inc: { coins: -amount } }, { session });
      await User.findByIdAndUpdate(contentDoc.creator, { $inc: { earningsCoins: creatorShare } }, { session });
      await ExclusiveContent.findByIdAndUpdate(
        contentDoc._id,
        { $inc: { totalUnlocks: 1, totalEarnings: creatorShare } },
        { session }
      );

      await ExclusiveUnlock.create(
        [{ user: req.userId, content: contentDoc._id, coinsPaid: amount, creatorShare, platformShare }],
        { session }
      );
    });

    // Record coin transactions (fire-and-forget; don't fail the unlock if this errors)
    CoinTransaction.create([
      {
        userId: req.userId,
        type: "content_unlock",
        amount: -contentDoc.coinPrice,
        reason: `Contenido desbloqueado: ${contentDoc.title}`,
        status: "completed",
        metadata: { contentId: contentDoc._id },
      },
      {
        userId: contentDoc.creator,
        type: "content_earned",
        amount: creatorShare,
        reason: `Contenido desbloqueado por usuario`,
        status: "completed",
        metadata: { contentId: contentDoc._id },
      },
    ]).catch((err) => console.error("[exclusive tx] Failed to record transactions:", err));

    res.status(201).json({ message: "Contenido desbloqueado" });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ message: err.message });
  } finally {
    session.endSession();
  }
};

// GET /api/exclusive/:id/access – check whether the authenticated user has access
const checkAccess = async (req, res) => {
  try {
    const content = await ExclusiveContent.findById(req.params.id);
    if (!content) return res.status(404).json({ message: "Contenido no encontrado" });

    if (String(content.creator) === String(req.userId)) {
      return res.json({ hasAccess: true });
    }
    const unlock = await ExclusiveUnlock.findOne({ user: req.userId, content: content._id });
    res.json({ hasAccess: !!unlock });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  listContent,
  myContent,
  createContent,
  getContent,
  unlockContent,
  checkAccess,
};
