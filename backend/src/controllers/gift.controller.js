const Gift = require("../models/Gift.js");
const GiftCatalog = require("../models/GiftCatalog.js");
const Live = require("../models/Live.js");
const User = require("../models/User.js");
const CoinTransaction = require("../models/CoinTransaction.js");
const AgencyRelationship = require("../models/AgencyRelationship.js");
const mongoose = require("mongoose");
const { calculateSplit } = require("../services/agency.service.js");
const { getIO } = require("../lib/socket.js");
const { trackEvent } = require("../services/missions.service.js");
const { createNotification } = require("../services/notification.service.js");

// 60% goes to the creator, 40% is the platform commission
const COMMISSION_RATE = 0.40;

// Default catalog items seeded when the collection is empty
const DEFAULT_CATALOG = [
  { name: "Neon Heart",   slug: "neon-heart",   icon: "💗", coinCost: 20,   rarity: "common",    sortOrder: 1 },
  { name: "Moon Rose",    slug: "moon-rose",    icon: "🌹", coinCost: 50,   rarity: "uncommon",  sortOrder: 2 },
  { name: "Fire Kiss",    slug: "fire-kiss",    icon: "🔥", coinCost: 100,  rarity: "rare",      sortOrder: 3 },
  { name: "Diamond Wink", slug: "diamond-wink", icon: "💎", coinCost: 250,  rarity: "epic",      sortOrder: 4 },
  { name: "Golden Ring",  slug: "golden-ring",  icon: "💍", coinCost: 500,  rarity: "legendary", sortOrder: 5 },
  { name: "Secret Flame", slug: "secret-flame", icon: "🕯️", coinCost: 1000, rarity: "mythic",    sortOrder: 6 },
];

const seedGiftCatalog = async () => {
  const count = await GiftCatalog.countDocuments();
  if (count === 0) {
    await GiftCatalog.insertMany(DEFAULT_CATALOG);
    console.log("[gifts] Seeded default gift catalog");
  }
};

// Shared helper: record coin transactions for a completed gift (fire-and-forget)
const recordGiftTransactions = (senderId, receiverId, amount, creatorNetShare, giftDocId, extra = {}) => {
  const txMeta = { giftId: giftDocId, ...extra };
  const txDocs = [
    {
      userId: senderId,
      type: "gift_sent",
      amount: -amount,
      reason: `Regalo enviado a ${receiverId}`,
      status: "completed",
      metadata: txMeta,
    },
  ];
  // Only record a credit transaction if the receiver actually earned coins
  if (creatorNetShare > 0) {
    txDocs.push({
      userId: receiverId,
      type: "gift_received",
      amount: creatorNetShare,
      reason: `Regalo recibido de ${senderId}`,
      status: "completed",
      metadata: txMeta,
    });
  }
  // Agency earning transaction is recorded separately in the send flow
  CoinTransaction.create(txDocs).catch((err) => console.error("[gift tx] Failed to record transactions:", err));
};

// Shared helper: transfer coins and credit creator earnings within a session.
// Returns { canEarn, platformShare, agencyShare, creatorNetShare, referrerId, agencyPercentageApplied }:
//   canEarn                 – whether the receiver is an approved creator
//   platformShare           – coins retained by the platform (fixed 40%)
//   agencyShare             – coins credited to the parent agency (0 if no agency)
//   creatorNetShare         – coins credited to the creator after agency share
//   referrerId              – ObjectId of the parent agency creator (null if none)
//   agencyPercentageApplied – the percentage used at this moment (0 if no agency)
const transferCoins = async (senderId, receiverId, amount, session) => {
  // Cast IDs to ObjectId to prevent NoSQL injection from user-supplied strings
  const senderObjId = new mongoose.Types.ObjectId(senderId);
  const receiverObjId = new mongoose.Types.ObjectId(receiverId);

  const sender = await User.findById(senderObjId).session(session);
  if (!sender) throw Object.assign(new Error("Sender no encontrado"), { status: 404 });
  if (sender.coins < amount) throw Object.assign(new Error("Monedas insuficientes"), { status: 400 });

  const receiver = await User.findById(receiverObjId).session(session);
  if (!receiver) throw Object.assign(new Error("Receiver no encontrado"), { status: 404 });

  await User.findByIdAndUpdate(senderObjId, { $inc: { coins: -amount } }, { session });

  // Only credit earningsCoins to approved creators
  const canEarn = receiver.role === "creator" && receiver.creatorStatus === "approved";

  // Always derive creatorSide as totalCoins - platformShare so all shares sum to totalCoins.
  // Agency percentage (if any) is applied only to creatorSide per business rules.
  let agencyShare = 0;
  let creatorNetShare = 0;
  let referrerId = null;
  let agencyPercentageApplied = 0;
  let platformShare = 0;

  if (canEarn) {
    // Agency commission is only applied when the relationship is active AND the sub-creator
    // has explicitly accepted the commission agreement (subCreatorAgreed = true).
    const rel = await AgencyRelationship.findOne({ subCreator: receiverObjId, status: "active", subCreatorAgreed: true }).session(session);
    const agencyPct = (rel && rel.percentage > 0) ? rel.percentage : null;
    const split = calculateSplit(amount, agencyPct);

    platformShare = split.platformShare;
    agencyShare = split.agencyShare;
    creatorNetShare = split.creatorNetShare;

    if (agencyPct) {
      referrerId = rel.parentCreator;
      agencyPercentageApplied = rel.percentage;
    }

    await User.findByIdAndUpdate(receiverObjId, { $inc: { earningsCoins: creatorNetShare } }, { session });

    if (agencyShare > 0 && referrerId) {
      await User.findByIdAndUpdate(
        referrerId,
        {
          $inc: {
            agencyEarningsCoins: agencyShare,
            totalAgencyGeneratedCoins: amount,
          },
        },
        { session }
      );
    }
  } else {
    // Non-creator receivers: platform still takes its share but earningsCoins are not credited
    platformShare = Math.floor(amount * COMMISSION_RATE);
  }

  return { canEarn, platformShare, agencyShare, creatorNetShare, referrerId, agencyPercentageApplied };
};

const getGiftCatalog = async (req, res) => {
  try {
    await seedGiftCatalog();
    const catalog = await GiftCatalog.find({ active: true }).sort({ sortOrder: 1, coinCost: 1 });
    res.json(catalog);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const sendGift = async (req, res) => {
  const { receiverId, giftId, giftSlug, liveId, context, contextId, message } = req.body;
  if (!receiverId || (!giftId && !giftSlug)) {
    return res.status(400).json({ message: "receiverId y giftId (o giftSlug) son requeridos" });
  }

  // Validate receiverId is a proper ObjectId before any comparison/lookup
  if (!mongoose.Types.ObjectId.isValid(receiverId)) {
    return res.status(400).json({ message: "receiverId inválido" });
  }

  // Prevent self-gifting
  if (String(req.userId) === String(receiverId)) {
    return res.status(400).json({ message: "No puedes enviarte un regalo a ti mismo" });
  }

  let catalogItem;
  try {
    if (giftSlug) {
      // Sanitize slug: only allow alphanumeric + hyphens to prevent NoSQL injection
      const safeSlug = String(giftSlug).replace(/[^a-z0-9-]/gi, "");
      catalogItem = await GiftCatalog.findOne({ slug: safeSlug, active: true });
    } else {
      if (!mongoose.Types.ObjectId.isValid(giftId)) {
        return res.status(400).json({ message: "giftId inválido" });
      }
      catalogItem = await GiftCatalog.findOne({ _id: new mongoose.Types.ObjectId(giftId), active: true });
    }
  } catch {
    return res.status(400).json({ message: "Identificador de regalo inválido" });
  }
  if (!catalogItem) {
    return res.status(404).json({ message: "Regalo no encontrado en el catálogo" });
  }

  // If sending a gift during a live, check that gifts are enabled for that live
  if (liveId) {
    if (!mongoose.Types.ObjectId.isValid(liveId)) {
      return res.status(400).json({ message: "liveId inválido" });
    }
    const live = await Live.findOne({ _id: liveId, isLive: true }).select("giftsEnabled");
    if (live && live.giftsEnabled === false) {
      return res.status(403).json({ message: "Los regalos están desactivados en este directo" });
    }
  }

  const amount = catalogItem.coinCost;

  const session = await mongoose.startSession();
  // Declared outside the transaction so it's accessible when building the Gift document
  let transferResult = { canEarn: false, platformShare: 0, agencyShare: 0, creatorNetShare: 0, referrerId: null, agencyPercentageApplied: 0 };
  try {
    await session.withTransaction(async () => {
      transferResult = await transferCoins(req.userId, receiverId, amount, session);
    });

    const { canEarn, platformShare, agencyShare, creatorNetShare, referrerId, agencyPercentageApplied } = transferResult;
    // Accurately reflect whether the receiver earned from this gift
    const effectiveCreatorShare = canEarn ? creatorNetShare : 0;

    const resolvedContext = context || (liveId ? "live" : "profile");
    const resolvedContextId = contextId || liveId || null;
    const giftDoc = await Gift.create({
      sender: req.userId,
      receiver: receiverId,
      giftCatalogItem: catalogItem._id,
      live: liveId || undefined,
      coinCost: amount,
      creatorShare: effectiveCreatorShare,
      platformShare,
      agencyShare: agencyShare || 0,
      referrerId: referrerId || undefined,
      agencyPercentageApplied: agencyPercentageApplied || 0,
      context: resolvedContext,
      contextId: resolvedContextId,
      message,
    });
    await giftDoc.populate("sender", "username name");
    await giftDoc.populate("giftCatalogItem", "name icon coinCost");

    recordGiftTransactions(req.userId, receiverId, amount, effectiveCreatorShare, giftDoc._id, { liveId: liveId || null });

    // Record agency earnings transaction (fire-and-forget)
    if (agencyShare > 0 && referrerId) {
      CoinTransaction.create({
        userId: referrerId,
        type: "agency_earned",
        amount: agencyShare,
        reason: `Comisión de agencia por regalo de ${req.userId}`,
        status: "completed",
        metadata: { giftId: giftDoc._id, subCreatorId: String(receiverId) },
      }).catch((err) => console.error("[agency tx] Failed to record agency earning:", err));
    }

    // Notify the gift receiver in real time
    const io = getIO();
    if (io) {
      const senderName = giftDoc.sender?.username || giftDoc.sender?.name || "Alguien";
      io.to(String(receiverId)).emit("GIFT_SENT", {
        senderName,
        receiverId: String(receiverId),
        giftName: giftDoc.giftCatalogItem?.name || "",
        giftIcon: giftDoc.giftCatalogItem?.icon || "🎁",
        coinCost: amount,
        liveId: liveId || null,
      });
      // Broadcast to all viewers in the live room so everyone sees the gift effect
      if (liveId) {
        io.to(`live:${liveId}`).emit("LIVE_GIFT_SENT", {
          senderName,
          senderId: String(req.userId),
          giftId: String(giftDoc._id),
          gift: {
            name: giftDoc.giftCatalogItem?.name || "",
            icon: giftDoc.giftCatalogItem?.icon || "🎁",
            coinCost: amount,
            rarity: catalogItem.rarity,
          },
          liveId,
        });
      }
    }

    res.status(201).json(giftDoc);

    // Gift-received persisted notification (fire-and-forget)
    const senderName = giftDoc.sender?.username || giftDoc.sender?.name || "Alguien";
    const giftName = giftDoc.giftCatalogItem?.name || "un regalo";
    createNotification(receiverId, {
      type: "gift",
      title: "🎁 Recibiste un regalo",
      message: `${senderName} te envió ${giftName}`,
      data: { liveId: liveId || null, giftId: String(giftDoc._id) },
    }).catch((err) => console.error("[notifications] gift notification failed:", err.message));

    // Push updated top-3 ranking to the live room (fire-and-forget)
    if (liveId) {
      const liveObjId = new mongoose.Types.ObjectId(liveId);
      Gift.aggregate([
        { $match: { live: liveObjId } },
        { $group: { _id: "$sender", totalCoins: { $sum: "$coinCost" } } },
        { $sort: { totalCoins: -1 } },
        { $limit: 3 },
        { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "u" } },
        { $unwind: { path: "$u", preserveNullAndEmptyArrays: true } },
        { $project: { _id: 0, userId: "$_id", totalCoins: 1, username: "$u.username", name: "$u.name" } },
      ]).then((topFans) => {
        const ioInst = getIO();
        if (ioInst) {
          ioInst.to(`live:${liveId}`).emit("LIVE_RANKING_UPDATED", { liveId, topFans });
        }
        // Top-fan position change detection — inferred without an extra query.
        // If the sender is now #1 with total T, their pre-gift total was T - amount.
        // If that pre-gift total was less than the #2 fan's current total, the sender
        // was NOT #1 before this gift: they just took the top spot.
        if (topFans.length > 0) {
          const leader = topFans[0];
          const senderId = String(req.userId);
          if (leader && String(leader.userId) === senderId) {
            const senderTotalBefore = (leader.totalCoins || 0) - amount;
            const runner = topFans[1];
            // Sender wasn't #1 before if there was no runner-up, or the runner-up's
            // total exceeded the sender's pre-gift total.
            const senderWasNotLeader = !runner || runner.totalCoins > senderTotalBefore;
            if (senderWasNotLeader) {
              createNotification(senderId, {
                type: "top_fan",
                title: "👑 Eres Top Fan",
                message: "Ahora eres el fan #1 en este live",
                data: { liveId },
              }).catch((err) => console.error("[notifications] top_fan notification failed:", err.message));
              // Notify the displaced #1 (now #2)
              if (runner) {
                createNotification(String(runner.userId), {
                  type: "top_fan_lost",
                  title: "⚠️ Perdiste el Top Fan",
                  message: "Alguien te superó, vuelve al live",
                  data: { liveId },
                }).catch((err) => console.error("[notifications] top_fan_lost notification failed:", err.message));
              }
            }
          }
        }
      }).catch((err) => console.error("[gift] top-fan ranking push failed:", err));
    }

    // Update live goal progress and battle scores (fire-and-forget)
    if (liveId) {
      Live.findOne({ _id: liveId, isLive: true }).select("goal battle").then((livDoc) => {
        if (!livDoc) return;
        const ioInst = getIO();
        const updates = {};
        let goalUpdated = false;
        let battleUpdated = false;

        if (livDoc.goal?.active && livDoc.goal.target > 0) {
          updates["goal.progress"] = amount;
          goalUpdated = true;
        }
        if (livDoc.battle?.active) {
          // Split gift coins equally between both teams (ceil to left, floor to right).
          // A proper per-team assignment would require the sender to choose a side —
          // this equal split keeps both team bars moving until that feature is added.
          const half = Math.floor(amount / 2);
          const remainder = amount - half; // ceil for left
          updates["battle.leftScore"] = remainder;
          updates["battle.rightScore"] = half;
          battleUpdated = true;
        }

        if (Object.keys(updates).length === 0) return;

        Live.findByIdAndUpdate(liveId, { $inc: updates }, { new: true }).select("goal battle").then((updated) => {
          if (!updated || !ioInst) return;
          if (goalUpdated && updated.goal) {
            ioInst.to(`live:${liveId}`).emit("LIVE_GOAL_UPDATED", { liveId, goal: updated.goal });
          }
          if (battleUpdated && updated.battle) {
            ioInst.to(`live:${liveId}`).emit("BATTLE_SCORE_UPDATED", { liveId, battle: updated.battle });
          }
        }).catch((err) => console.error("[gift] live goal/battle update failed:", err));
      }).catch((err) => console.error("[gift] live lookup for goal/battle failed:", err));
    }

    // Track gift mission progress (fire-and-forget)
    trackEvent(req.userId, "gift").catch(() => {});
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ message: err.message });
  } finally {
    session.endSession();
  }
};

const getReceivedGifts = async (req, res) => {
  try {
    const gifts = await Gift.find({ receiver: req.userId })
      .populate("sender", "username name")
      .populate("giftCatalogItem", "name icon coinCost")
      .sort({ createdAt: -1 });
    res.json(gifts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/gifts/send — accepts giftSlug instead of giftId
const sendGiftBySlug = async (req, res) => {
  const { giftSlug, receiverId, context, contextId } = req.body;
  if (!receiverId || !giftSlug) {
    return res.status(400).json({ message: "receiverId y giftSlug son requeridos" });
  }

  if (String(req.userId) === String(receiverId)) {
    return res.status(400).json({ message: "No puedes enviarte un regalo a ti mismo" });
  }

  let catalogItem;
  try {
    catalogItem = await GiftCatalog.findOne({ slug: giftSlug, active: true });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
  if (!catalogItem) {
    return res.status(404).json({ message: "Regalo no encontrado en el catálogo" });
  }

  const amount = catalogItem.coinCost;

  const session = await mongoose.startSession();
  let transferResult = { canEarn: false, platformShare: 0, agencyShare: 0, creatorNetShare: 0, referrerId: null, agencyPercentageApplied: 0 };
  try {
    await session.withTransaction(async () => {
      transferResult = await transferCoins(req.userId, receiverId, amount, session);
    });

    const { canEarn, platformShare, agencyShare, creatorNetShare, referrerId, agencyPercentageApplied } = transferResult;
    const effectiveCreatorShare = canEarn ? creatorNetShare : 0;

    const resolvedContext = context || "profile";
    const resolvedContextId = contextId || null;
    const giftDoc = await Gift.create({
      sender: req.userId,
      receiver: receiverId,
      giftCatalogItem: catalogItem._id,
      coinCost: amount,
      creatorShare: effectiveCreatorShare,
      platformShare,
      agencyShare: agencyShare || 0,
      referrerId: referrerId || undefined,
      agencyPercentageApplied: agencyPercentageApplied || 0,
      context: resolvedContext,
      contextId: resolvedContextId,
    });
    await giftDoc.populate("sender", "username name");
    await giftDoc.populate("giftCatalogItem", "name icon coinCost");

    recordGiftTransactions(req.userId, receiverId, amount, effectiveCreatorShare, giftDoc._id);

    if (agencyShare > 0 && referrerId) {
      CoinTransaction.create({
        userId: referrerId,
        type: "agency_earned",
        amount: agencyShare,
        reason: `Comisión de agencia por regalo de ${req.userId}`,
        status: "completed",
        metadata: { giftId: giftDoc._id, subCreatorId: String(receiverId) },
      }).catch((err) => console.error("[agency tx] Failed to record agency earning:", err));
    }

    res.status(201).json(giftDoc);

    // Track gift mission progress (fire-and-forget)
    trackEvent(req.userId, "gift").catch(() => {});
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ message: err.message });
  } finally {
    session.endSession();
  }
};

// ── Admin: gift catalog management ────────────────────────────────────────────

const adminGetCatalog = async (req, res) => {
  try {
    const catalog = await GiftCatalog.find({}).sort({ coinCost: 1 });
    res.json(catalog);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const adminCreateCatalogItem = async (req, res) => {
  try {
    const { name, slug, icon, coinCost, active, rarity } = req.body;
    if (!name || !slug || !icon || !coinCost) {
      return res.status(400).json({ message: "name, slug, icon y coinCost son requeridos" });
    }
    const item = await GiftCatalog.create({
      name,
      slug,
      icon,
      coinCost,
      active: active !== false,
      rarity: rarity || "common",
    });
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const adminUpdateCatalogItem = async (req, res) => {
  try {
    const { name, slug, icon, coinCost, active, rarity } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (slug !== undefined) updates.slug = slug;
    if (icon !== undefined) updates.icon = icon;
    if (coinCost !== undefined) updates.coinCost = coinCost;
    if (active !== undefined) updates.active = active;
    if (rarity !== undefined) updates.rarity = rarity;
    const item = await GiftCatalog.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!item) return res.status(404).json({ message: "Item no encontrado" });
    res.json(item);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const adminDeleteCatalogItem = async (req, res) => {
  try {
    const item = await GiftCatalog.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ message: "Item no encontrado" });
    res.json({ message: "Item eliminado" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  sendGift,
  sendGiftBySlug,
  getReceivedGifts,
  getGiftCatalog,
  adminGetCatalog,
  adminCreateCatalogItem,
  adminUpdateCatalogItem,
  adminDeleteCatalogItem,
};
