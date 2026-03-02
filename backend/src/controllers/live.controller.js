const crypto = require("crypto");
const Live = require("../models/Live.js");

const startLive = async (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ message: "title es requerido" });
  try {
    const streamKey = crypto.randomBytes(16).toString("hex");
    const live = await Live.create({
      user: req.userId,
      title,
      description,
      streamKey,
      isLive: true,
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
    const lives = await Live.find({ isLive: true }).populate("user", "username name");
    res.json(lives);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { startLive, endLive, getLives };
