const Gift = require("../models/Gift.js");

const sendGift = async (req, res) => {
  const { receiverId, liveId, amount, message } = req.body;
  if (!receiverId || !amount) {
    return res.status(400).json({ message: "receiverId y amount son requeridos" });
  }
  if (amount < 1) {
    return res.status(400).json({ message: "El monto debe ser al menos 1" });
  }
  try {
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
    res.status(500).json({ message: err.message });
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
