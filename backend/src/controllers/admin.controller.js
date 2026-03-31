const User = require("../models/User.js");
const Live = require("../models/Live.js");
const Report = require("../models/Report.js");
const Subscription = require("../models/Subscription.js");

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

exports.getCreatorRequests = async (req, res) => {
  try {
    const requests = await User.find(
      {
        $or: [
          { creatorStatus: "pending" },
          { creatorRequest: true, role: "creator_pending" },
        ],
      },
      "-password"
    )
      .sort({ createdAt: -1 })
      .limit(100);
    return res.json({ ok: true, requests });
  } catch (error) {
    console.error("Creator requests error:", error);
    return res.status(500).json({ ok: false, message: "Error obteniendo solicitudes" });
  }
};

exports.approveCreator = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        role: "creator",
        creatorRequest: false,
        creatorApprovedAt: new Date(),
        creatorStatus: "approved",
        "creatorApplication.reviewedAt": new Date(),
        "creatorApplication.reviewedBy": req.userId,
      },
      { new: true, select: "-password" }
    );
    if (!user) return res.status(404).json({ ok: false, message: "Usuario no encontrado" });
    return res.json({ ok: true, user });
  } catch (error) {
    console.error("Approve creator error:", error);
    return res.status(500).json({ ok: false, message: "Error aprobando solicitud" });
  }
};

exports.rejectCreator = async (req, res) => {
  try {
    const { notes } = req.body;
    const update = {
      role: "user",
      creatorRequest: false,
      creatorStatus: "rejected",
      "creatorApplication.reviewedAt": new Date(),
      "creatorApplication.reviewedBy": req.userId,
    };
    if (notes && typeof notes === "string") {
      update["creatorApplication.notes"] = notes.trim();
    }
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true, select: "-password" });
    if (!user) return res.status(404).json({ ok: false, message: "Usuario no encontrado" });
    return res.json({ ok: true, user });
  } catch (error) {
    console.error("Reject creator error:", error);
    return res.status(500).json({ ok: false, message: "Error rechazando solicitud" });
  }
};

exports.getVerificationRequests = async (req, res) => {
  try {
    const requests = await User.find({ verificationStatus: "pending" }, "-password")
      .sort({ createdAt: -1 })
      .limit(100);
    return res.json({ ok: true, requests });
  } catch (error) {
    console.error("Verification requests error:", error);
    return res.status(500).json({ ok: false, message: "Error obteniendo solicitudes de verificación" });
  }
};

exports.verifyUser = async (req, res) => {
  try {
    const { action } = req.body;
    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ ok: false, message: "Acción inválida. Usa 'approve' o 'reject'" });
    }
    const updates =
      action === "approve"
        ? { isVerified: true, verificationStatus: "approved" }
        : { isVerified: false, verificationStatus: "rejected" };
    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, select: "-password" });
    if (!user) return res.status(404).json({ ok: false, message: "Usuario no encontrado" });
    return res.json({ ok: true, user });
  } catch (error) {
    console.error("Verify user error:", error);
    return res.status(500).json({ ok: false, message: "Error procesando verificación" });
  }
};
