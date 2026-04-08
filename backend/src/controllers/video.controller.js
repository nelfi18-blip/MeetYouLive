const Video = require("../models/Video.js");
const Purchase = require("../models/Purchase.js");
const User = require("../models/User.js");

const getVideos = async (req, res) => {
  try {
    // Only return public videos to unauthenticated callers.
    const videos = await Video.find({ isPrivate: false })
      .populate("user", "username name")
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(videos);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createVideo = async (req, res) => {
  const { title, description, url, isPrivate, price } = req.body;
  if (!title || !url) {
    return res.status(400).json({ message: "title y url son requeridos" });
  }
  const parsedPrice = Number(price);
  if (isPrivate && (price !== undefined && (isNaN(parsedPrice) || parsedPrice < 0))) {
    return res.status(400).json({ message: "price debe ser un número mayor o igual a 0" });
  }
  try {
    const user = await User.findById(req.userId).select("role creatorStatus");
    if (!user || (user.role !== "admin" && (user.role !== "creator" || user.creatorStatus !== "approved"))) {
      return res.status(403).json({ message: "Solo los creadores aprobados pueden subir vídeos" });
    }
    const video = await Video.create({
      user: req.userId,
      title: title.trim(),
      description: description ? description.trim() : "",
      url: url.trim(),
      isPrivate: Boolean(isPrivate),
      price: isPrivate ? (parsedPrice || 0) : 0,
    });
    await video.populate("user", "username name");
    res.status(201).json(video);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getVideoById = async (req, res) => {
  try {
    const video = await Video.findById(req.params.videoId).populate("user", "username name");
    if (!video) return res.status(404).json({ message: "Vídeo no encontrado" });
    // Private videos are only accessible to their owner.
    if (video.isPrivate && String(video.user._id) !== String(req.userId)) {
      return res.status(403).json({ message: "Este vídeo es privado" });
    }
    res.json(video);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const canWatchVideo = async (req, res) => {
  try {
    const bought = await Purchase.findOne({
      user: req.userId,
      video: req.params.videoId,
    });
    res.json({ access: !!bought });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getVideos, createVideo, getVideoById, canWatchVideo };
