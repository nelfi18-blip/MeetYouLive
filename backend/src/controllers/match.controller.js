const Like = require("../models/Like.js");
const Chat = require("../models/Chat.js");

// Like a user. Returns whether it's a mutual match.
exports.likeUser = async (req, res) => {
  const { userId } = req.params;
  if (String(userId) === String(req.userId)) {
    return res.status(400).json({ message: "No puedes dar like a ti mismo" });
  }
  try {
    // Upsert the like (idempotent)
    await Like.findOneAndUpdate(
      { from: req.userId, to: userId },
      { from: req.userId, to: userId },
      { upsert: true }
    );

    // Check if the other user already liked back → mutual match
    const mutual = await Like.findOne({ from: userId, to: req.userId });

    if (mutual) {
      // Ensure a chat room exists for the matched pair
      const participants = [req.userId, userId].sort();
      await Chat.findOneAndUpdate(
        { participants: { $all: participants, $size: 2 } },
        { $setOnInsert: { participants } },
        { upsert: true }
      );
    }

    res.json({ match: !!mutual });
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate – already liked, just return current match status
      const mutual = await Like.findOne({ from: userId, to: req.userId });
      return res.json({ match: !!mutual });
    }
    res.status(500).json({ message: err.message });
  }
};

// Remove a like (pass)
exports.unlikeUser = async (req, res) => {
  const { userId } = req.params;
  try {
    await Like.deleteOne({ from: req.userId, to: userId });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get all mutual matches for the current user
exports.getMatches = async (req, res) => {
  try {
    // Users the current user liked
    const myLikes = await Like.find({ from: req.userId }).select("to");
    const myLikedIds = myLikes.map((l) => String(l.to));

    // Among those, find who also liked the current user back
    const mutualLikes = await Like.find({
      from: { $in: myLikedIds },
      to: req.userId,
    }).populate("from", "username name avatar bio role");

    const matches = mutualLikes.map((l) => l.from);
    res.json({ matches });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Check if a specific user is a mutual match
exports.checkMatch = async (req, res) => {
  const { userId } = req.params;
  try {
    const iLiked   = await Like.findOne({ from: req.userId, to: userId });
    const theyLiked = await Like.findOne({ from: userId, to: req.userId });
    res.json({ iLiked: !!iLiked, theyLiked: !!theyLiked, match: !!iLiked && !!theyLiked });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
