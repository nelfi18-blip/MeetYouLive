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
const { unlockAchievement } = require("../services/progression.service.js");
const { trackAnalyticsEvent } = require("../services/analytics.service.js");

// 60% goes to the creator, 40% is the platform commission
const COMMISSION_RATE = 0.40;

// Gift tier boundaries (shared with frontend/lib/giftTiers.js)
const TIER_BOUNDARIES = {
  BASIC_MAX: 100,      // Basic tier: 0-100 coins
  PREMIUM_MAX: 500,    // Premium tier: 101-500 coins
  // Super tier: 501+ coins
};

// Default catalog items seeded when the collection is empty
const DEFAULT_CATALOG = [
  // ═══════════════════════════════════════════════════════════════
  // EMOTIONAL (hearts, kiss, hug)
  // ═══════════════════════════════════════════════════════════════
  { name: "Neon Heart",     slug: "neon-heart",     icon: "💗", coinCost: 20,   category: "emotional", type: "basic",   animationType: "small",      isSuper: false, rarity: "common",    sortOrder: 1 },
  { name: "Love Kiss",      slug: "love-kiss",      icon: "💋", coinCost: 50,   category: "emotional", type: "basic",   animationType: "small",      isSuper: false, rarity: "uncommon",  sortOrder: 2 },
  { name: "Warm Hug",       slug: "warm-hug",       icon: "🤗", coinCost: 80,   category: "emotional", type: "basic",   animationType: "small",      isSuper: false, rarity: "uncommon",  sortOrder: 3 },
  { name: "Heart Burst",    slug: "heart-burst",    icon: "💖", coinCost: 150,  category: "emotional", type: "premium", animationType: "medium",     isSuper: false, rarity: "rare",      sortOrder: 4 },
  { name: "Golden Hearts",  slug: "golden-hearts",  icon: "💛", coinCost: 300,  category: "emotional", type: "premium", animationType: "medium",     isSuper: false, rarity: "epic",      sortOrder: 5 },

  // ═══════════════════════════════════════════════════════════════
  // ENERGY (lightning, fire, boost)
  // ═══════════════════════════════════════════════════════════════
  { name: "Fire Kiss",      slug: "fire-kiss",      icon: "🔥", coinCost: 100,  category: "energy", type: "basic",   animationType: "small",      isSuper: false, rarity: "rare",      sortOrder: 10 },
  { name: "Lightning Bolt", slug: "lightning-bolt", icon: "⚡", coinCost: 200,  category: "energy", type: "premium", animationType: "medium",     isSuper: false, rarity: "rare",      sortOrder: 11 },
  { name: "Energy Boost",   slug: "energy-boost",   icon: "💥", coinCost: 250,  category: "energy", type: "premium", animationType: "medium",     isSuper: false, rarity: "epic",      sortOrder: 12 },
  { name: "Cosmic Power",   slug: "cosmic-power",   icon: "💫", coinCost: 500,  category: "energy", type: "premium", animationType: "medium",     isSuper: false, rarity: "legendary", sortOrder: 13 },

  // ═══════════════════════════════════════════════════════════════
  // LUXURY (cars, crown, jet, diamond)
  // ═══════════════════════════════════════════════════════════════
  { name: "Diamond Wink",   slug: "diamond-wink",   icon: "💎", coinCost: 250,  category: "luxury", type: "premium", animationType: "medium",     isSuper: false, rarity: "epic",      sortOrder: 20 },
  { name: "Golden Ring",    slug: "golden-ring",    icon: "💍", coinCost: 400,  category: "luxury", type: "premium", animationType: "medium",     isSuper: false, rarity: "epic",      sortOrder: 21 },
  { name: "Royal Crown",    slug: "royal-crown",    icon: "👑", coinCost: 800,  category: "luxury", type: "super",   animationType: "fullscreen", isSuper: true,  rarity: "legendary", sortOrder: 22 },
  { name: "Luxury Car",     slug: "luxury-car",     icon: "🚗", coinCost: 1500, category: "luxury", type: "super",   animationType: "fullscreen", isSuper: true,  rarity: "legendary", sortOrder: 23 },
  { name: "Private Jet",    slug: "private-jet",    icon: "✈️", coinCost: 3000, category: "luxury", type: "super",   animationType: "fullscreen", isSuper: true,  rarity: "mythic",    sortOrder: 24 },

  // ═══════════════════════════════════════════════════════════════
  // SHOW (fireworks, rocket, party)
  // ═══════════════════════════════════════════════════════════════
  { name: "Moon Rose",      slug: "moon-rose",      icon: "🌹", coinCost: 50,   category: "show", type: "basic",   animationType: "small",      isSuper: false, rarity: "uncommon",  sortOrder: 30 },
  { name: "Party Popper",   slug: "party-popper",   icon: "🎉", coinCost: 120,  category: "show", type: "premium", animationType: "medium",     isSuper: false, rarity: "rare",      sortOrder: 31 },
  { name: "Fireworks",      slug: "fireworks",      icon: "🎆", coinCost: 350,  category: "show", type: "premium", animationType: "medium",     isSuper: false, rarity: "epic",      sortOrder: 32 },
  { name: "Rocket Launch",  slug: "rocket-launch",  icon: "🚀", coinCost: 600,  category: "show", type: "super",   animationType: "fullscreen", isSuper: true,  rarity: "legendary", sortOrder: 33 },
  { name: "Stage Show",     slug: "stage-show",     icon: "🎭", coinCost: 1000, category: "show", type: "super",   animationType: "fullscreen", isSuper: true,  rarity: "legendary", sortOrder: 34 },

  // ═══════════════════════════════════════════════════════════════
  // EXCLUSIVE (portal, aura, mystical, VR effects)
  // ═══════════════════════════════════════════════════════════════
  { name: "Secret Flame",   slug: "secret-flame",   icon: "🕯️", coinCost: 500,  category: "exclusive", type: "premium", animationType: "medium",     isSuper: false, rarity: "legendary", sortOrder: 40 },
  { name: "Magic Portal",   slug: "magic-portal",   icon: "🌀", coinCost: 1200, category: "exclusive", type: "super",   animationType: "fullscreen", isSuper: true,  rarity: "legendary", sortOrder: 41 },
  { name: "Golden Aura",    slug: "golden-aura",    icon: "✨", coinCost: 2000, category: "exclusive", type: "super",   animationType: "fullscreen", isSuper: true,  rarity: "mythic",    sortOrder: 42 },
  { name: "Mystical Dream", slug: "mystical-dream", icon: "🔮", coinCost: 2500, category: "exclusive", type: "super",   animationType: "fullscreen", isSuper: true,  rarity: "mythic",    sortOrder: 43 },
  { name: "VR Universe",    slug: "vr-universe",    icon: "🌌", coinCost: 5000, category: "exclusive", type: "super",   animationType: "fullscreen", isSuper: true,  rarity: "mythic",    sortOrder: 44 },
];

const seedGiftCatalog = async () => {
  const count = await GiftCatalog.countDocuments();
  if (count === 0) {
    await GiftCatalog.insertMany(DEFAULT_CATALOG);
    console.log("[gifts] Seeded default gift catalog");
  }
};

// Shared helper: record coin transactions for a completed gift.
const recordGiftTransactions = async (senderId, receiverId, amount, creatorNetShare, giftDocId, extra = {}, session = null) => {
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
  await CoinTransaction.create([txDocs].flat(), { session: session || undefined });
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

  const sender = await User.findOneAndUpdate(
    { _id: senderObjId, coins: { $gte: amount } },
    { $inc: { coins: -amount } },
    { new: true, session, select: "_id coins" }
  );
  if (!sender) {
    const exists = await User.exists({ _id: senderObjId }).session(session);
    throw Object.assign(new Error(exists ? "Monedas insuficientes" : "Sender no encontrado"), {
      status: exists ? 400 : 404,
    });
  }

  const receiver = await User.findById(receiverObjId).session(session);
  if (!receiver) throw Object.assign(new Error("Receiver no encontrado"), { status: 404 });

  // Only credit earningsCoins to approved creators or subCreators
  const canEarn = (receiver.role === "creator" || receiver.role === "subCreator") && receiver.creatorStatus === "approved";

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

const VALID_QUANTITIES = new Set([1, 5, 10, 50]);
const MAX_QUANTITY = 50;

// Bundle discount rates applied to x10 and x50 packs (e.g. 0.10 = 10% off)
const BUNDLE_DISCOUNTS = { 10: 0.10, 50: 0.20 };

const sendGift = async (req, res) => {
  const { receiverId, giftId, giftSlug, liveId, context, contextId, message, quantity: rawQuantity } = req.body;
  if (!receiverId || (!giftId && !giftSlug)) {
    return res.status(400).json({ message: "receiverId y giftId (o giftSlug) son requeridos" });
  }

  // Validate quantity: must be one of the allowed pack sizes
  const quantity = Number.isInteger(rawQuantity) ? rawQuantity : 1;
  if (!VALID_QUANTITIES.has(quantity) || quantity > MAX_QUANTITY) {
    return res.status(400).json({ message: "Cantidad inválida. Valores permitidos: 1, 5, 10, 50" });
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

  // Context resolution: Uses explicit context from request body if provided, otherwise infers:
  // - "live" if liveId is present
  // - "profile" as default
  // Valid contexts: "live" (live stream), "private_call" (chat), "profile" (user profile)
  const resolvedContext = context || (liveId ? "live" : "profile");

  // RESTRICTION: Super gifts can ONLY be sent in live context with a valid liveId
  // Both conditions must be met: correct context AND liveId present
  
  // Determine gift type with proper fallback logic for backward compatibility:
  // 1. Use explicit `type` field if present (new system)
  // 2. Derive from coinCost using TIER_BOUNDARIES (for gifts without type field)
  // 3. Use legacy isSuper flag as final fallback (for old data migration)
  // Note: The pre-save hook on GiftCatalog syncs isSuper from type for new saves,
  //       but the isSuper fallback handles existing documents without type field
  const giftType = catalogItem.type || (
    catalogItem.coinCost > TIER_BOUNDARIES.PREMIUM_MAX ? "super" :
    catalogItem.coinCost > TIER_BOUNDARIES.BASIC_MAX ? "premium" :
    catalogItem.isSuper ? "super" : "basic"
  );
  
  if (giftType === "super" && (resolvedContext !== "live" || !liveId)) {
    return res.status(403).json({ 
      message: "Este regalo solo se puede enviar en directo 🔥",
      requiresLive: true 
    });
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

  // Apply bundle discount for x10 and x50 packs
  const bundleDiscount = BUNDLE_DISCOUNTS[quantity] || 0;
  const amount = Math.floor(catalogItem.coinCost * quantity * (1 - bundleDiscount)); // total cost — always calculated server-side

  const session = await mongoose.startSession();
  let transferResult = { canEarn: false, platformShare: 0, agencyShare: 0, creatorNetShare: 0, referrerId: null, agencyPercentageApplied: 0 };
  let giftDoc;
  let effectiveCreatorShare = 0;
  try {
    await session.withTransaction(async () => {
      transferResult = await transferCoins(req.userId, receiverId, amount, session);

      const { canEarn, platformShare, agencyShare, creatorNetShare, referrerId, agencyPercentageApplied } = transferResult;
      // Accurately reflect whether the receiver earned from this gift
      effectiveCreatorShare = canEarn ? creatorNetShare : 0;

      const resolvedContextId = contextId || liveId || null;
      const [createdGift] = await Gift.create([{
        sender: req.userId,
        receiver: receiverId,
        giftCatalogItem: catalogItem._id,
        live: liveId || undefined,
        quantity,
        unitCost: catalogItem.coinCost,
        coinCost: amount,
        creatorShare: effectiveCreatorShare,
        platformShare,
        agencyShare: agencyShare || 0,
        referrerId: referrerId || undefined,
        agencyPercentageApplied: agencyPercentageApplied || 0,
        context: resolvedContext,
        contextId: resolvedContextId,
        message,
      }], { session });
      giftDoc = createdGift;

      await recordGiftTransactions(req.userId, receiverId, amount, effectiveCreatorShare, giftDoc._id, { liveId: liveId || null }, session);

      if (agencyShare > 0 && referrerId) {
        await CoinTransaction.create(
          [{
            userId: referrerId,
            type: "agency_earned",
            amount: agencyShare,
            reason: `Comisión de agencia por regalo de ${req.userId}`,
            status: "completed",
            metadata: { giftId: giftDoc._id, subCreatorId: String(receiverId) },
          }],
          { session }
        );
      }
    });

    await giftDoc.populate("sender", "username name");
    await giftDoc.populate("giftCatalogItem", "name icon coinCost rarity isSuper type animationType animationUrl soundUrl");

    // Update receiver's profile gift stats (fire-and-forget)
    // DESIGN NOTE: This uses a two-step update pattern with eventual consistency.
    // 
    // Why not atomic?
    // - topGifts is a complex array that requires sorting and limiting to top 10
    // - MongoDB's $push + $sort + $slice can't handle increments + insertions atomically
    // - Alternative would be to store ALL gifts and aggregate on read (expensive)
    // 
    // Trade-off:
    // - Counter increments (totalReceivedGifts/Coins) are ALWAYS accurate (atomic $inc)
    // - topGifts array may lose concurrent updates but self-corrects with next gift
    // - This is acceptable since topGifts is display-only and doesn't affect payouts
    // - Performance benefit: avoids read-before-write in transaction (50ms+ saved)
    User.findByIdAndUpdate(
      receiverId,
      {
        $inc: {
          totalReceivedGifts: quantity,
          totalReceivedCoins: amount,
        },
      },
      { new: true }
    ).then((receiver) => {
      if (!receiver) return;
      
      // Update topGifts array: increment count or add new entry
      const topGifts = [...(receiver.topGifts || [])];
      const existingIdx = topGifts.findIndex((g) => String(g.giftId) === String(catalogItem._id));
      
      if (existingIdx >= 0) {
        // Update existing gift entry
        topGifts[existingIdx] = {
          ...topGifts[existingIdx],
          count: topGifts[existingIdx].count + quantity,
          totalCoins: topGifts[existingIdx].totalCoins + amount,
          lastReceivedAt: new Date(),
        };
      } else {
        // Add new gift entry
        topGifts.push({
          giftId: catalogItem._id,
          giftName: catalogItem.name,
          giftIcon: catalogItem.icon,
          count: quantity,
          totalCoins: amount,
          lastReceivedAt: new Date(),
        });
      }
      
      // Sort by totalCoins descending and keep top 10
      topGifts.sort((a, b) => b.totalCoins - a.totalCoins);
      const limitedTopGifts = topGifts.slice(0, 10);
      
      // Update topGifts - may lose concurrent updates but will self-correct
      User.findByIdAndUpdate(
        receiverId,
        { $set: { topGifts: limitedTopGifts } },
        { new: false }
      ).catch((err) => {
        // Log only non-trivial errors
        console.error("[gift] Failed to update topGifts:", err.message || err);
      });
    }).catch((err) => console.error("[gift] Failed to update profile gift stats:", err.message || err));

    // Notify the gift receiver in real time
    const io = getIO();
    if (io) {
      const senderName = giftDoc.sender?.username || giftDoc.sender?.name || "Alguien";
      const giftData = {
        name: giftDoc.giftCatalogItem?.name || "",
        icon: giftDoc.giftCatalogItem?.icon || "🎁",
        coinCost: amount,
        unitCost: catalogItem.coinCost,
        rarity: catalogItem.rarity,
        category: catalogItem.category || "emotional",
        isSuper: catalogItem.isSuper || false,
        quantity,
      };

      
      // Context-specific socket events
      if (resolvedContext === "live") {
        // LIVE GIFTS: Full broadcast to all viewers in the live room
        io.to(`live:${liveId}`).emit("LIVE_GIFT_SENT", {
          senderName,
          senderId: String(req.userId),
          giftId: String(giftDoc._id),
          quantity,
          gift: {
            name: giftDoc.giftCatalogItem?.name || "",
            icon: giftDoc.giftCatalogItem?.icon || "🎁",
            coinCost: amount,
            unitCost: catalogItem.coinCost,
            rarity: catalogItem.rarity,
            isSuper: catalogItem.isSuper || false,
            type: catalogItem.type || "basic",
            animationType: catalogItem.animationType || "small",
            animationUrl: catalogItem.animationUrl || null,
            soundUrl: catalogItem.soundUrl || null,
          },
          liveId,
        });

        // NEW: Emit special "super_gift" event for super gifts
        if (catalogItem.type === "super") {
          io.to(`live:${liveId}`).emit("super_gift", {
            sender: senderName,
            senderId: String(req.userId),
            gift: {
              name: giftDoc.giftCatalogItem?.name || "",
              icon: giftDoc.giftCatalogItem?.icon || "🎁",
            },
            value: amount,
            animationType: catalogItem.animationType || "fullscreen",
            quantity,
          });
        }
      } else if (resolvedContext === "private_call") {
        // CHAT GIFTS: Only sender and receiver (small animation, no fullscreen)
        // Note: Stored context is "private_call" but socket event context is "chat" for frontend clarity
        const chatGiftData = {
          senderName,
          senderId: String(req.userId),
          receiverId: String(receiverId),
          giftName: giftDoc.giftCatalogItem?.name || "",
          giftIcon: giftDoc.giftCatalogItem?.icon || "🎁",
          coinCost: amount,
          quantity,
          context: "chat", // Simplified label for frontend display
        };
        io.to(String(req.userId)).emit("CHAT_GIFT_SENT", chatGiftData);
        io.to(String(receiverId)).emit("CHAT_GIFT_SENT", chatGiftData);
      } else {
        // PROFILE GIFTS: Only sender and receiver (no animation)
        const profileGiftData = {
          senderName,
          senderId: String(req.userId),
          receiverId: String(receiverId),
          giftName: giftDoc.giftCatalogItem?.name || "",
          giftIcon: giftDoc.giftCatalogItem?.icon || "🎁",
          coinCost: amount,
          quantity,
          context: "profile",
        };
        io.to(String(req.userId)).emit("PROFILE_GIFT_SENT", profileGiftData);
        io.to(String(receiverId)).emit("PROFILE_GIFT_SENT", profileGiftData);
      }
    }

    res.status(201).json(giftDoc);

    // Analytics: gift_sent (fire-and-forget)
    trackAnalyticsEvent("gift_sent", String(req.userId), {
      amount,
      quantity,
      liveId: liveId || null,
    });

    // Gift-received persisted notification (fire-and-forget)
    const senderName = giftDoc.sender?.username || giftDoc.sender?.name || "Alguien";
    const giftName = giftDoc.giftCatalogItem?.name || "un regalo";
    const qtyLabel = quantity > 1 ? ` x${quantity}` : "";
    createNotification(receiverId, {
      type: "gift",
      title: "🎁 Recibiste un regalo",
      message: `${senderName} te envió ${giftName}${qtyLabel}`,
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
              // Unlock top-fan achievement (fire-and-forget)
              unlockAchievement(senderId, "top_fan_first").catch(() => {});
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

    // Update top supporter for the live room (fire-and-forget)
    if (liveId) {
      const liveObjId = new mongoose.Types.ObjectId(liveId);
      const senderId = new mongoose.Types.ObjectId(req.userId);
      const senderUsername = giftDoc.sender?.username || giftDoc.sender?.name || "Alguien";
      
      // Get total coins spent by the current sender in this live
      Gift.aggregate([
        { $match: { live: liveObjId, sender: senderId } },
        { $group: { _id: null, totalCoins: { $sum: "$coinCost" } } },
      ]).then((result) => {
        if (!result || result.length === 0) return;
        
        const senderTotalCoins = result[0].totalCoins || 0;
        
        // Atomic update: only set this user as top supporter if their total exceeds current top
        // This prevents race conditions when multiple gifts are sent simultaneously
        Live.findOneAndUpdate(
          {
            _id: liveId,
            $or: [
              { topSupporter: null },
              { topSupporter: { $exists: false } },
              { "topSupporter.totalCoins": { $lt: senderTotalCoins } },
            ],
          },
          {
            $set: {
              "topSupporter.userId": req.userId,
              "topSupporter.username": senderUsername,
              "topSupporter.totalCoins": senderTotalCoins,
            }
          },
          { new: true }
        ).then((updated) => {
          // Only emit if the update actually happened (user became new top supporter)
          if (updated) {
            const ioInst = getIO();
            if (ioInst) {
              ioInst.to(`live:${liveId}`).emit("TOP_SUPPORTER_UPDATE", {
                liveId,
                userId: String(req.userId),
                username: senderUsername,
                totalCoins: senderTotalCoins,
              });
            }
          }
        }).catch((err) => console.error("[gift] top supporter update failed:", err));
      }).catch((err) => console.error("[gift] top supporter aggregation failed:", err));
    }

    // Track gift combo streaks (fire-and-forget)
    // NOTE: Race condition mitigation - Uses read-modify-write with retry logic.
    // For very high-traffic scenarios (>100 gifts/sec per live), consider Redis.
    if (liveId) {
      const COMBO_WINDOW_MS = 3000; // 3 seconds
      const now = new Date();
      const senderId = String(req.userId);
      // Note: Backend uses Spanish text throughout (messages, error responses, fallbacks).
      // Frontend handles i18n via next-intl. "Alguien" = "Someone" matches backend convention.
      const senderUsername = giftDoc.sender?.username || giftDoc.sender?.name || "Alguien";

      // Retry logic to handle race conditions during concurrent gift sending
      const updateComboWithRetry = async (retries = 2) => {
        try {
          const livDoc = await Live.findById(liveId).select("userCombos");
          if (!livDoc) return;

          // Get current combo state for this user (Mongoose Map)
          const combos = livDoc.userCombos;
          const existingCombo = combos.get(senderId);

          let newComboCount = 1;
          
          if (existingCombo) {
            const lastGiftAt = new Date(existingCombo.lastGiftAt);
            const timeSinceLastGift = now - lastGiftAt;
            
            if (timeSinceLastGift <= COMBO_WINDOW_MS) {
              // Within combo window: increment combo
              newComboCount = (existingCombo.comboCount || 1) + 1;
            }
            // else: outside window, reset to 1
          }

          // Update combo state. Structure matches userComboSchema documentation.
          // Store senderId as string to match Map key type.
          combos.set(senderId, {
            userId: senderId, // String (matches schema doc and Map key)
            username: senderUsername, // String
            comboCount: newComboCount, // Number
            lastGiftAt: now, // Date
          });

          // Save to database with version check to detect concurrent modifications
          livDoc.userCombos = combos;
          await livDoc.save();

          // Emit combo event if combo >= 2
          if (newComboCount >= 2) {
            const ioInst = getIO();
            if (ioInst) {
              ioInst.to(`live:${liveId}`).emit("GIFT_COMBO", {
                liveId,
                userId: senderId,
                username: senderUsername,
                comboCount: newComboCount,
              });
            }
          }
        } catch (err) {
          // Retry on version conflict (VersionError) if retries remain
          if (err.name === "VersionError" && retries > 0) {
            return updateComboWithRetry(retries - 1);
          }
          console.error("[gift] combo update failed for user", senderId, "in live", liveId, ":", err);
        }
      };

      updateComboWithRetry().catch(() => {}); // Fire-and-forget with internal error handling
    }

    // Update live goal progress and battle scores (fire-and-forget)
    if (liveId) {
      // Validate and cast to ObjectId to prevent NoSQL injection
      if (!mongoose.Types.ObjectId.isValid(liveId)) {
        console.error("[gift] Invalid liveId for goal/battle/vs update:", liveId);
        return;
      }
      const liveObjId = new mongoose.Types.ObjectId(liveId);
      Live.findOne({ _id: liveObjId, isLive: true }).select("goal battle isVsActive opponentId vsScore user").then(async (livDoc) => {
        if (!livDoc) return;
        const ioInst = getIO();
        const updates = {};
        let goalUpdated = false;
        let battleUpdated = false;
        let vsUpdated = false;

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
        
        // VS Battle: Add coins to the host's score (receiver is the host of this live)
        if (livDoc.isVsActive && livDoc.opponentId) {
          updates["vsScore.host"] = amount;
          vsUpdated = true;
        }

        if (Object.keys(updates).length === 0) return;

        Live.findByIdAndUpdate(liveObjId, { $inc: updates }, { new: true }).select("goal battle isVsActive opponentId vsScore").then(async (updated) => {
          if (!updated || !ioInst) return;
          if (goalUpdated && updated.goal) {
            ioInst.to(`live:${liveObjId}`).emit("LIVE_GOAL_UPDATED", { liveId: String(liveObjId), goal: updated.goal });
          }
          if (battleUpdated && updated.battle) {
            ioInst.to(`live:${liveObjId}`).emit("BATTLE_SCORE_UPDATED", { liveId: String(liveObjId), battle: updated.battle });
          }
          
          // VS Battle: Update both rooms with current scores
          // NOTE: For high-traffic scenarios (>100 gifts/sec), consider using Redis cache
          // for opponent scores to reduce database load during VS battles.
          if (vsUpdated && updated.isVsActive && updated.opponentId) {
            const opponentLive = await Live.findById(updated.opponentId).select("vsScore");
            if (opponentLive && opponentLive.vsScore) {
              const hostScore = updated.vsScore?.host || 0;
              const opponentScore = opponentLive.vsScore?.host || 0;
              
              // Update both lives with opponent scores in parallel
              await Promise.all([
                Live.findByIdAndUpdate(liveObjId, { 
                  $set: { "vsScore.opponent": opponentScore } 
                }),
                Live.findByIdAndUpdate(updated.opponentId, { 
                  $set: { "vsScore.opponent": hostScore } 
                }),
              ]);
              
              // Emit to both rooms
              ioInst.to(`live:${liveObjId}`).emit("vs_update", {
                hostScore,
                opponentScore,
              });
              
              ioInst.to(`live:${updated.opponentId}`).emit("vs_update", {
                hostScore: opponentScore,
                opponentScore: hostScore,
              });
            }
          }
        }).catch((err) => console.error("[gift] live goal/battle/vs update failed:", err));
      }).catch((err) => console.error("[gift] live lookup for goal/battle/vs failed:", err));
    }

    // Track gift mission progress (fire-and-forget)
    trackEvent(req.userId, "gift").catch(() => {});

    // Unlock first-gift achievement (fire-and-forget)
    unlockAchievement(req.userId, "gift_first_sent").catch(() => {});
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

// Get profile gift stats for a specific user
const getProfileGiftStats = async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "userId inválido" });
    }
    
    const user = await User.findById(userId).select("totalReceivedGifts totalReceivedCoins topGifts");
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    
    res.json({
      totalReceivedGifts: user.totalReceivedGifts || 0,
      totalReceivedCoins: user.totalReceivedCoins || 0,
      topGifts: user.topGifts || [],
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get top supporters (people who sent the most gifts to this user)
const getTopSupporters = async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "userId inválido" });
    }
    
    const receiverObjId = new mongoose.Types.ObjectId(userId);
    
    const topSupporters = await Gift.aggregate([
      { $match: { receiver: receiverObjId } },
      {
        $group: {
          _id: "$sender",
          totalGifts: { $sum: "$quantity" },
          totalCoins: { $sum: "$coinCost" },
          lastGiftAt: { $max: "$createdAt" },
        },
      },
      { $sort: { totalCoins: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          userId: "$_id",
          username: "$user.username",
          name: "$user.name",
          avatar: "$user.avatar",
          totalGifts: 1,
          totalCoins: 1,
          lastGiftAt: 1,
        },
      },
    ]);
    
    res.json(topSupporters);
  } catch (err) {
    res.status(500).json({ message: err.message });
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
    const { name, slug, icon, coinCost, active, rarity, category, isSuper, animationUrl, iconUrl, soundUrl, sortOrder } = req.body;
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
      category: category || "emotional",
      isSuper: isSuper || false,
      animationUrl: animationUrl || "",
      iconUrl: iconUrl || "",
      soundUrl: soundUrl || "",
      sortOrder: sortOrder || 0,
    });
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const adminUpdateCatalogItem = async (req, res) => {
  try {
    const { name, slug, icon, coinCost, active, rarity, category, isSuper, animationUrl, iconUrl, soundUrl, sortOrder } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (slug !== undefined) updates.slug = slug;
    if (icon !== undefined) updates.icon = icon;
    if (coinCost !== undefined) updates.coinCost = coinCost;
    if (active !== undefined) updates.active = active;
    if (rarity !== undefined) updates.rarity = rarity;
    if (category !== undefined) updates.category = category;
    if (isSuper !== undefined) updates.isSuper = isSuper;
    if (animationUrl !== undefined) updates.animationUrl = animationUrl;
    if (iconUrl !== undefined) updates.iconUrl = iconUrl;
    if (soundUrl !== undefined) updates.soundUrl = soundUrl;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
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
  getReceivedGifts,
  getGiftCatalog,
  getProfileGiftStats,
  getTopSupporters,
  adminGetCatalog,
  adminCreateCatalogItem,
  adminUpdateCatalogItem,
  adminDeleteCatalogItem,
};
