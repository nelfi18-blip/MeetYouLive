const mongoose = require("mongoose");
const ExclusiveContent = require("../models/ExclusiveContent.js");
const ExclusiveUnlock = require("../models/ExclusiveUnlock.js");
const User = require("../models/User.js");
const CoinTransaction = require("../models/CoinTransaction.js");
const { calculateSplit } = require("../services/agency.service.js");

// 60% goes to the creator, 40% is the platform commission
const COMMISSION_RATE = 0.40;

// GET /api/exclusive – list all published exclusive content
const listContent = async (req, res) => {
  try {
    const content = await ExclusiveContent.find({ isActive: true })
      .populate("creator", "username name avatar")
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(content);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/exclusive/creator/:creatorId – published content for a specific creator (public)
const listByCreator = async (req, res) => {
  try {
    const content = await ExclusiveContent.find({
      creator: req.params.creatorId,
      isActive: true,
    })
      .populate("creator", "username name avatar")
      .sort({ createdAt: -1 })
      .limit(50);

    // Build a set of unlocked content IDs for the authenticated user
    let unlockedSet = new Set();
    if (req.userId) {
      const contentIds = content.map((c) => c._id);
      const unlocks = await ExclusiveUnlock.find({
        user: req.userId,
        content: { $in: contentIds },
      }).select("content");
      unlockedSet = new Set(unlocks.map((u) => String(u.content)));
    }

    const annotated = content.map((item) => {
      const obj = item.toObject();
      const isOwner = req.userId && String(item.creator._id) === String(req.userId);
      obj.hasAccess = !item.isExclusive || isOwner || unlockedSet.has(String(item._id));
      if (!obj.hasAccess) delete obj.mediaUrl;
      return obj;
    });
    res.json(annotated);
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

    const { title, description, type, thumbnailUrl, mediaUrl, coinPrice } = req.body;
    if (!title || !mediaUrl || !type) {
      return res.status(400).json({ message: "title, type y mediaUrl son requeridos" });
    }
    if (!["photo", "video"].includes(type)) {
      return res.status(400).json({ message: "type debe ser 'photo' o 'video'" });
    }
    const parsedPrice = Number(coinPrice);
    if (isNaN(parsedPrice) || parsedPrice < 1) {
      return res.status(400).json({ message: "coinPrice debe ser al menos 1" });
    }

    const content = await ExclusiveContent.create({
      creator: req.userId,
      title: title.trim(),
      description: description ? description.trim() : "",
      type,
      thumbnailUrl: thumbnailUrl ? thumbnailUrl.trim() : "",
      mediaUrl: mediaUrl.trim(),
      coinPrice: parsedPrice,
    });
    await content.populate("creator", "username name avatar");
    res.status(201).json(content);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/exclusive/:id – get content by id (mediaUrl hidden unless access granted)
const getContent = async (req, res) => {
  try {
    const content = await ExclusiveContent.findById(req.params.id)
      .populate("creator", "username name avatar");
    if (!content || !content.isActive) {
      return res.status(404).json({ message: "Contenido no encontrado" });
    }

    // Non-exclusive content is freely accessible; exclusive content requires unlock
    let hasAccess = !content.isExclusive;
    if (!hasAccess && req.userId) {
      if (String(content.creator._id) === String(req.userId)) {
        hasAccess = true; // Creator always has access to their own content
      } else {
        const unlock = await ExclusiveUnlock.findOne({ user: req.userId, content: content._id });
        hasAccess = !!unlock;
      }
    }

    const response = content.toObject();
    if (!hasAccess) {
      delete response.mediaUrl;
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
  // Declared outside transaction for use in fire-and-forget transactions below
  let txAgencyShare = 0;
  let txParentCreatorId = null;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      contentDoc = await ExclusiveContent.findById(req.params.id).session(session);
      if (!contentDoc || !contentDoc.isActive) {
        throw Object.assign(new Error("Contenido no encontrado"), { status: 404 });
      }
      if (!contentDoc.isExclusive) {
        throw Object.assign(new Error("Este contenido es de acceso libre"), { status: 400 });
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
      const fullCreatorSide = Math.floor(amount * (1 - COMMISSION_RATE));

      // Apply agency split if creator has an active parent agency
      const creatorDoc = await User.findById(contentDoc.creator).session(session);
      let agencyShare = 0;
      let creatorNetShare = fullCreatorSide;
      let parentCreatorId = null;

      if (creatorDoc) {
        const rel = creatorDoc.agencyRelationship;
        if (rel && rel.status === "active" && rel.parentCreatorId && rel.parentCreatorPercentage > 0) {
          const split = calculateSplit(amount, rel.parentCreatorPercentage);
          agencyShare = split.agencyShare;
          creatorNetShare = split.creatorNetShare;
          parentCreatorId = rel.parentCreatorId;
        }
      }

      creatorShare = creatorNetShare;
      // Platform always takes fixed 40%; agency share comes from creator's 60% only
      const platformShare = Math.floor(amount * COMMISSION_RATE);

      const buyer = await User.findById(req.userId).session(session);
      if (!buyer || buyer.coins < amount) {
        throw Object.assign(new Error("Monedas insuficientes"), { status: 400 });
      }

      await User.findByIdAndUpdate(req.userId, { $inc: { coins: -amount } }, { session });
      await User.findByIdAndUpdate(contentDoc.creator, { $inc: { earningsCoins: creatorNetShare } }, { session });

      if (agencyShare > 0 && parentCreatorId) {
        await User.findByIdAndUpdate(
          parentCreatorId,
          { $inc: { agencyEarningsCoins: agencyShare, totalAgencyGeneratedCoins: amount } },
          { session }
        );
      }

      await ExclusiveContent.findByIdAndUpdate(
        contentDoc._id,
        { $inc: { totalUnlocks: 1, totalEarnings: creatorNetShare } },
        { session }
      );

      await ExclusiveUnlock.create(
        [{ user: req.userId, content: contentDoc._id, coinsPaid: amount, creatorShare: creatorNetShare, platformShare, agencyShare, referrerId: parentCreatorId || null }],
        { session }
      );

      // Capture for use after transaction
      txAgencyShare = agencyShare;
      txParentCreatorId = parentCreatorId;
    });

    // Record coin transactions (fire-and-forget; don't fail the unlock if this errors)
    const txDocs = [
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
    ];
    if (txAgencyShare > 0 && txParentCreatorId) {
      txDocs.push({
        userId: txParentCreatorId,
        type: "agency_earned",
        amount: txAgencyShare,
        reason: `Comisión de agencia por contenido exclusivo`,
        status: "completed",
        metadata: { contentId: contentDoc._id, subCreatorId: String(contentDoc.creator) },
      });
    }
    CoinTransaction.create(txDocs).catch((err) => console.error("[exclusive tx] Failed to record transactions:", err));

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

    if (!content.isExclusive) return res.json({ hasAccess: true });
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
  listByCreator,
  myContent,
  createContent,
  getContent,
  unlockContent,
  checkAccess,
};
