const User = require("../models/User");
const Live = require("../models/Live");
const Report = require("../models/Report");
const Subscription = require("../models/Subscription");

exports.getOverview = async (req, res) => {
  try {
    const [users, lives, reports, subscriptions, admins] = await Promise.all([
      User.countDocuments(),
      Live.countDocuments(),
      Report.countDocuments(),
      Subscription.countDocuments(),
      User.countDocuments({ role: "admin" }),
    ]);

    return res.json({
      ok: true,
      stats: {
        users,
        lives,
        reports,
        subscriptions,
        admins,
      },
    });
  } catch (error) {
    console.error("Admin overview error:", error);
    return res.status(500).json({ ok: false, message: "Error obteniendo resumen admin" });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const users = await User.find({}, "-password")
      .sort({ createdAt: -1 })
      .limit(100);

    return res.json({ ok: true, users });
  } catch (error) {
    console.error("Admin users error:", error);
    return res.status(500).json({ ok: false, message: "Error obteniendo usuarios" });
  }
};

exports.getReports = async (req, res) => {
  try {
    const reports = await Report.find({})
      .sort({ createdAt: -1 })
      .limit(100);

    return res.json({ ok: true, reports });
  } catch (error) {
    console.error("Admin reports error:", error);
    return res.status(500).json({ ok: false, message: "Error obteniendo reportes" });
  }
};

exports.makeAdmin = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ ok: false, message: "userId es requerido" });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { role: "admin" },
      { new: true, select: "-password" }
    );

    if (!user) {
      return res.status(404).json({ ok: false, message: "Usuario no encontrado" });
    }

    return res.json({ ok: true, user });
  } catch (error) {
    console.error("Make admin error:", error);
    return res.status(500).json({ ok: false, message: "Error actualizando usuario" });
  }
};
