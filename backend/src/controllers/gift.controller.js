const Gift = require("../models/Gift.js");
const User = require("../models/User.js");
const mongoose = require("mongoose");

const COMMISSION_RATE = 0.20;

const sendGift = async (req, res) => {
  const { receiverId, liveId, amount, message } = req.body;
  if (!receiverId || !amount) {
    return res.status(400).json({ message: "receiverId y amount son requeridos" });
  }
  if (!Number.isInteger(amount) || amount < 1) {
    return res.status(400).json({ message: "El monto debe ser un entero de al menos 1" });
  }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const sender = await User.findById(req.userId).session(session);
      if (!sender) throw Object.assign(new Error("Sender no encontrado"), { status: 404 });
      if (sender.coins < amount) throw Object.assign(new Error("Monedas insuficientes"), { status: 400 });

      const receiver = await User.findById(receiverId).session(session);
      if (!receiver) throw Object.assign(new Error("Receiver no encontrado"), { status: 404 });

      const netAmount = Math.floor(amount * (1 - COMMISSION_RATE));

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

module.exports = { sendGift, getReceivedGifts };
