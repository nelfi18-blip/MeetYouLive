const Gift = require("../models/Gift.js");
const GiftCatalog = require("../models/GiftCatalog.js");
const User = require("../models/User.js");
const CoinTransaction = require("../models/CoinTransaction.js");
const mongoose = require("mongoose");

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
const recordGiftTransactions = (senderId, receiverId, amount, creatorShare, giftDocId, extra = {}) => {
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
  if (creatorShare > 0) {
    txDocs.push({
      userId: receiverId,
      type: "gift_received",
      amount: creatorShare,
      reason: `Regalo recibido de ${senderId}`,
      status: "completed",
      metadata: txMeta,
    });
  }
  CoinTransaction.create(txDocs).catch((err) => console.error("[gift tx] Failed to record transactions:", err));
};

// Shared helper: transfer coins and credit creator earnings within a session.
// Returns {boolean} whether the receiver earns (is an approved creator).
const transferCoins = async (senderId, receiverId, amount, creatorShare, session) => {
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
  if (canEarn) {
    await User.findByIdAndUpdate(receiverObjId, { $inc: { earningsCoins: creatorShare } }, { session });
  }
  return canEarn;
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
  const fullCreatorShare = Math.floor(amount * (1 - COMMISSION_RATE));

  const session = await mongoose.startSession();
  // Declared outside the transaction so it's accessible when building the Gift document
  let receiverEarns = false;
  try {
    await session.withTransaction(async () => {
      receiverEarns = await transferCoins(req.userId, receiverId, amount, fullCreatorShare, session);
    });

    // Accurately reflect whether the receiver earned from this gift
    const creatorShare = receiverEarns ? fullCreatorShare : 0;
    const platformShare = amount - creatorShare;

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

    recordGiftTransactions(req.userId, receiverId, amount, creatorShare, giftDoc._id, { liveId: liveId || null });

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
  const creatorShare = Math.floor(amount * (1 - COMMISSION_RATE));
  const platformShare = amount - creatorShare;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(() =>
      transferCoins(req.userId, receiverId, amount, creatorShare, session)
    );

    const resolvedContext = context || "profile";
    const resolvedContextId = contextId || null;
    const giftDoc = await Gift.create({
      sender: req.userId,
      receiver: receiverId,
      giftCatalogItem: catalogItem._id,
      coinCost: amount,
      creatorShare,
      platformShare,
      context: resolvedContext,
      contextId: resolvedContextId,
    });
    await giftDoc.populate("sender", "username name");
    await giftDoc.populate("giftCatalogItem", "name icon coinCost");

    recordGiftTransactions(req.userId, receiverId, amount, creatorShare, giftDoc._id);

    res.status(201).json(giftDoc);
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
