const Gift = require("../models/Gift.js");
const User = require("../models/User.js");
const CoinTransaction = require("../models/CoinTransaction.js");
const mongoose = require("mongoose");

// 60% goes to the creator, 40% is the platform commission
const COMMISSION_RATE = 0.40;

// Predefined gift catalog with icon and coin cost
const GIFT_CATALOG = [
  { id: "rose", name: "Rosa", icon: "🌹", coins: 5, description: "Una rosa para tu favorito" },
  { id: "heart", name: "Corazón", icon: "❤️", coins: 10, description: "Muestra tu amor" },
  { id: "star", name: "Estrella", icon: "⭐", coins: 20, description: "Brilla en el chat" },
  { id: "fire", name: "Fuego", icon: "🔥", coins: 50, description: "¡Esto está on fire!" },
  { id: "diamond", name: "Diamante", icon: "💎", coins: 100, description: "El regalo más preciado" },
  { id: "crown", name: "Corona", icon: "👑", coins: 200, description: "Para el rey o la reina del directo" },
  { id: "rocket", name: "Cohete", icon: "🚀", coins: 500, description: "Lanza al streamer a la luna" },
];

const getGiftCatalog = (req, res) => {
  res.json(GIFT_CATALOG);
};

const sendGift = async (req, res) => {
  const { receiverId, liveId, amount, message } = req.body;
  if (!receiverId || !amount) {
    return res.status(400).json({ message: "receiverId y amount son requeridos" });
  }
  if (!Number.isInteger(amount) || amount < 1) {
    return res.status(400).json({ message: "El monto debe ser un entero de al menos 1" });
  }
  const session = await mongoose.startSession();
  const netAmount = Math.floor(amount * (1 - COMMISSION_RATE));
  try {
    await session.withTransaction(async () => {
      const sender = await User.findById(req.userId).session(session);
      if (!sender) throw Object.assign(new Error("Sender no encontrado"), { status: 404 });
      if (sender.coins < amount) throw Object.assign(new Error("Monedas insuficientes"), { status: 400 });

      const receiver = await User.findById(receiverId).session(session);
      if (!receiver) throw Object.assign(new Error("Receiver no encontrado"), { status: 404 });

      await User.findByIdAndUpdate(req.userId, { $inc: { coins: -amount } }, { session });
      await User.findByIdAndUpdate(receiverId, { $inc: { earningsCoins: netAmount } }, { session });
    });

    const gift = await Gift.create({
      sender: req.userId,
      receiver: receiverId,
      live: liveId || undefined,
      amount,
      message,
    });
    await gift.populate("sender", "username name");

    // Record coin transactions (fire-and-forget; don't fail the gift if this errors)
    const txMeta = { giftId: gift._id, liveId: liveId || null };
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
        amount: netAmount,
        reason: `Regalo recibido de ${req.userId}`,
        status: "completed",
        metadata: txMeta,
      },
    ]).catch((err) => console.error("[gift tx] Failed to record transactions:", err));

    res.status(201).json(gift);
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
      .sort({ createdAt: -1 });
    res.json(gifts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { sendGift, getReceivedGifts, getGiftCatalog };
