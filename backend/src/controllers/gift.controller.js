const Gift = require("../models/Gift.js");
const GiftCatalog = require("../models/GiftCatalog.js");
const User = require("../models/User.js");
const CoinTransaction = require("../models/CoinTransaction.js");
const mongoose = require("mongoose");

// 60% goes to the creator, 40% is the platform commission
const COMMISSION_RATE = 0.40;

// Default catalog items seeded when the collection is empty
const DEFAULT_CATALOG = [
  { name: "Neon Heart",   slug: "neon-heart",   icon: "💗", coinCost: 20,   rarity: "common"    },
  { name: "Moon Rose",    slug: "moon-rose",    icon: "🌹", coinCost: 50,   rarity: "uncommon"  },
  { name: "Fire Kiss",    slug: "fire-kiss",    icon: "🔥", coinCost: 100,  rarity: "rare"      },
  { name: "Diamond Wink", slug: "diamond-wink", icon: "💎", coinCost: 250,  rarity: "epic"      },
  { name: "Golden Ring",  slug: "golden-ring",  icon: "💍", coinCost: 500,  rarity: "legendary" },
  { name: "Secret Flame", slug: "secret-flame", icon: "🕯️", coinCost: 1000, rarity: "mythic"    },
];

const seedGiftCatalog = async () => {
  const count = await GiftCatalog.countDocuments();
  if (count === 0) {
    await GiftCatalog.insertMany(DEFAULT_CATALOG);
    console.log("[gifts] Seeded default gift catalog");
  }
};

const getGiftCatalog = async (req, res) => {
  try {
    await seedGiftCatalog();
    const catalog = await GiftCatalog.find({ active: true }).sort({ coinCost: 1 });
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

  const amount = catalogItem.coinCost;
  const creatorShare = Math.floor(amount * (1 - COMMISSION_RATE));
  const platformShare = amount - creatorShare;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const sender = await User.findById(req.userId).session(session);
      if (!sender) throw Object.assign(new Error("Sender no encontrado"), { status: 404 });
      if (sender.coins < amount) throw Object.assign(new Error("Monedas insuficientes"), { status: 400 });

      const receiver = await User.findById(receiverId).session(session);
      if (!receiver) throw Object.assign(new Error("Receiver no encontrado"), { status: 404 });

      await User.findByIdAndUpdate(req.userId, { $inc: { coins: -amount } }, { session });
      await User.findByIdAndUpdate(receiverId, { $inc: { earningsCoins: creatorShare } }, { session });
    });

    const resolvedContext = context || (liveId ? "live" : "profile");
    const resolvedContextId = contextId || liveId || null;
    const giftDoc = await Gift.create({
      sender: req.userId,
      receiver: receiverId,
      giftCatalogItem: catalogItem._id,
      live: liveId || undefined,
      coinCost: amount,
      creatorShare,
      platformShare,
      context: resolvedContext,
      contextId: resolvedContextId,
      message,
    });
    await giftDoc.populate("sender", "username name");
    await giftDoc.populate("giftCatalogItem", "name icon coinCost");

    // Record coin transactions (fire-and-forget; don't fail the gift if this errors)
    const txMeta = { giftId: giftDoc._id, liveId: liveId || null };
    CoinTransaction.create([
      {
        userId: req.userId,
        type: "gift_sent",
        amount: -amount,
        reason: `Regalo enviado a ${receiverId}`,
        status: "completed",
        metadata: txMeta,
      },
      {
        userId: receiverId,
        type: "gift_received",
        amount: creatorShare,
        reason: `Regalo recibido de ${req.userId}`,
        status: "completed",
        metadata: txMeta,
      },
    ]).catch((err) => console.error("[gift tx] Failed to record transactions:", err));

    res.status(201).json(giftDoc);
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
  getReceivedGifts,
  getGiftCatalog,
  adminGetCatalog,
  adminCreateCatalogItem,
  adminUpdateCatalogItem,
  adminDeleteCatalogItem,
};
