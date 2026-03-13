const Purchase = require("../models/Purchase.js");
const Video = require("../models/Video.js");

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

const getVideos = async (req, res) => {
  try {
    const filter = { isPrivate: false };
    if (req.query.userId) filter.user = req.query.userId;
    const videos = await Video.find(filter)
      .populate("user", "username name")
      .sort({ createdAt: -1 });
    res.json(videos);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getVideo = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id).populate("user", "username name");
    if (!video) return res.status(404).json({ message: "Video no encontrado" });
    if (video.isPrivate && String(video.user._id) !== String(req.userId)) {
      return res.status(403).json({ message: "Acceso denegado" });
    }
    res.json(video);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createVideo = async (req, res) => {
  const { title, description, url, isPrivate, price } = req.body;
  if (!title || !url) {
    return res.status(400).json({ message: "title y url son requeridos" });
  }
  try {
    const video = await Video.create({
      user: req.userId,
      title,
      description,
      url,
      isPrivate: isPrivate || false,
      price: price || 0,
    });
    await video.populate("user", "username name");
    res.status(201).json(video);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateVideo = async (req, res) => {
  const { title, description, isPrivate, price } = req.body;
  const update = {};
  if (title !== undefined) update.title = title;
  if (description !== undefined) update.description = description;
  if (isPrivate !== undefined) update.isPrivate = isPrivate;
  if (price !== undefined) update.price = price;

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ message: "No hay campos para actualizar" });
  }

  try {
    const video = await Video.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      { $set: update },
      { new: true, runValidators: true }
    ).populate("user", "username name");
    if (!video) return res.status(404).json({ message: "Video no encontrado" });
    res.json(video);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteVideo = async (req, res) => {
  try {
    const video = await Video.findOneAndDelete({ _id: req.params.id, user: req.userId });
    if (!video) return res.status(404).json({ message: "Video no encontrado" });
    res.json({ message: "Video eliminado" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { canWatchVideo, getVideos, getVideo, createVideo, updateVideo, deleteVideo };
