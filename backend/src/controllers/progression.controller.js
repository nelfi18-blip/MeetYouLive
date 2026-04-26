const { getProgression } = require("../services/progression.service.js");

/**
 * GET /api/user/progression
 * Returns the authenticated user's XP, level, and achievement data.
 */
const getUserProgression = async (req, res) => {
  try {
    const data = await getProgression(req.userId);
    if (!data) return res.status(404).json({ message: "User not found" });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getUserProgression };
