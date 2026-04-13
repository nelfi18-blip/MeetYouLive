const { getMissions } = require("../services/missions.service.js");

/**
 * GET /api/missions/today
 * Returns today's missions and progress for the authenticated user.
 */
const getTodayMissions = async (req, res) => {
  try {
    const data = await getMissions(req.userId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getTodayMissions };
