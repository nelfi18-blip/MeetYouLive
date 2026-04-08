const mongoose = require("mongoose");
const Gift = require("../models/Gift");
const User = require("../models/User");
const Payout = require("../models/Payout");

const requireApprovedCreatorHelper = async (userId) => {
  const user = await User.findById(userId).select(
    "role creatorStatus username name creatorApprovedAt earningsCoins coins agencyEarningsCoins"
  );

  if (!user || user.role !== "creator" || user.creatorStatus !== "approved") {
    return { error: "Acceso restringido a creadores aprobados.", user: null };
  }

  return { error: null, user };
};

exports.getCreatorStats = async (req, res) => {
  try {
    const userId = req.userId || req.user?.id;
    const { error, user } = await requireApprovedCreatorHelper(userId);

    if (error) {
      return res.status(403).json({ ok: false, message: error });
    }

    const aggregateResult = await Gift.aggregate([
      { $match: { receiver: new mongoose.Types.ObjectId(user._id) } },
      {
        $group: {
          _id: null,
          totalCoinsReceived: { $sum: "$coinCost" },
          totalCreatorShare: { $sum: "$creatorShare" },
          totalGiftCount: { $sum: 1 },
        },
      },
    ]);

    const liveCount = await mongoose.model("Live").countDocuments({
      user: user._id,
      status: { $in: ["live", "active"] },
    }).catch(() => 0);

    const pendingPayout = await Payout.findOne({
      creator: user._id,
      status: { $in: ["pending", "processing"] },
    }).sort({ createdAt: -1 });

    const totals = aggregateResult[0] || {
      totalCoinsReceived: 0,
      totalCreatorShare: 0,
      totalGiftCount: 0,
    };

    return res.json({
      ok: true,
      earningsCoins: user.earningsCoins || 0,
      agencyEarningsCoins: user.agencyEarningsCoins || 0,
      coins: user.coins || 0,
      totalLives: liveCount,
      totalGifts: totals.totalGiftCount || 0,
      totalCoinsReceived: totals.totalCoinsReceived || 0,
      totalCreatorShare: totals.totalCreatorShare || 0,
      pendingPayout: pendingPayout
        ? {
            _id: pendingPayout._id,
            amountCoins: pendingPayout.amountCoins,
            status: pendingPayout.status,
            createdAt: pendingPayout.createdAt,
          }
        : null,
    });
  } catch (err) {
    console.error("getCreatorStats error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Error interno del servidor" });
  }
};

exports.getCreatorEarnings = async (req, res) => {
  try {
    const userId = req.userId || req.user?.id;
    const { error, user } = await requireApprovedCreatorHelper(userId);

    if (error) {
      return res.status(403).json({ ok: false, message: error });
    }

    const aggregateResult = await Gift.aggregate([
      { $match: { receiver: new mongoose.Types.ObjectId(user._id) } },
      {
        $group: {
          _id: null,
          totalCoinsReceived: { $sum: "$coinCost" },
          totalCreatorShare: { $sum: "$creatorShare" },
          totalPlatformShare: { $sum: "$platformShare" },
          totalGiftCount: { $sum: 1 },
        },
      },
    ]);

    const recentTransactions = await Gift.find({ receiver: user._id })
      .populate("sender", "username name avatar")
      .populate("giftCatalogItem")
      .sort({ createdAt: -1 })
      .limit(20);

    const totals = aggregateResult[0] || {
      totalCoinsReceived: 0,
      totalCreatorShare: 0,
      totalPlatformShare: 0,
      totalGiftCount: 0,
    };

    return res.json({
      ok: true,
      totalCoinsReceived: totals.totalCoinsReceived,
      totalCreatorShare: totals.totalCreatorShare,
      totalPlatformShare: totals.totalPlatformShare,
      totalGiftCount: totals.totalGiftCount,
      recentTransactions,
    });
  } catch (err) {
    console.error("getCreatorEarnings error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Error interno del servidor" });
  }
};

exports.requestPayout = async (req, res) => {
  try {
    const userId = req.userId || req.user?.id;
    const { error, user } = await requireApprovedCreatorHelper(userId);

    if (error) {
      return res.status(403).json({ ok: false, message: error });
    }

    const MIN_PAYOUT_COINS = 100;
    const available = user.earningsCoins || 0;

    if (available < MIN_PAYOUT_COINS) {
      return res.status(400).json({
        ok: false,
        message: "No tienes el mínimo requerido para solicitar retiro.",
        minRequired: MIN_PAYOUT_COINS,
        current: available,
      });
    }

    const existingPending = await Payout.findOne({
      creator: user._id,
      status: { $in: ["pending", "processing"] },
    });

    if (existingPending) {
      return res.status(409).json({
        ok: false,
        message: "Ya tienes una solicitud de retiro pendiente.",
        payout: {
          _id: existingPending._id,
          amountCoins: existingPending.amountCoins,
          status: existingPending.status,
          createdAt: existingPending.createdAt,
        },
      });
    }

    const updatedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        earningsCoins: available,
      },
      {
        $set: { earningsCoins: 0 },
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(409).json({
        ok: false,
        message:
          "No se pudo procesar el retiro porque tu balance cambió. Inténtalo de nuevo.",
      });
    }

    const payout = await Payout.create({
      creator: user._id,
      amountCoins: available,
      status: "pending",
      notes: "Solicitud creada automáticamente desde creator dashboard.",
    });

    return res.json({
      ok: true,
      message: "Solicitud de retiro registrada correctamente.",
      payout: {
        _id: payout._id,
        amountCoins: payout.amountCoins,
        status: payout.status,
        createdAt: payout.createdAt,
      },
    });
  } catch (err) {
    console.error("requestPayout error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Error interno del servidor" });
  }
};

// GET /api/creator/dashboard — consolidated creator dashboard data (approved creators only)
exports.getCreatorDashboard = async (req, res) => {
  try {
    const userId = req.userId || req.user?.id;
    const { error, user } = await requireApprovedCreatorHelper(userId);

    if (error) {
      return res.status(403).json({ ok: false, message: error });
    }

    const Live = mongoose.model("Live");

    const [giftAgg, activeLive, pendingPayout] = await Promise.all([
      Gift.aggregate([
        { $match: { receiver: new mongoose.Types.ObjectId(user._id) } },
        {
          $group: {
            _id: null,
            totalCoinsReceived: { $sum: "$coinCost" },
            totalCreatorShare: { $sum: "$creatorShare" },
            totalGiftCount: { $sum: 1 },
          },
        },
      ]),
      Live.findOne({ user: user._id, isLive: true }).select(
        "_id title viewerCount chatEnabled giftsEnabled isPrivate entryCost"
      ),
      Payout.findOne({
        creator: user._id,
        status: { $in: ["pending", "processing"] },
      }).sort({ createdAt: -1 }),
    ]);

    const totals = giftAgg[0] || {
      totalCoinsReceived: 0,
      totalCreatorShare: 0,
      totalGiftCount: 0,
    };

    return res.json({
      ok: true,
      activeLive: activeLive || null,
      earningsCoins: user.earningsCoins || 0,
      agencyEarningsCoins: user.agencyEarningsCoins || 0,
      coins: user.coins || 0,
      totalGifts: totals.totalGiftCount || 0,
      totalCoinsReceived: totals.totalCoinsReceived || 0,
      totalCreatorShare: totals.totalCreatorShare || 0,
      pendingPayout: pendingPayout
        ? {
            _id: pendingPayout._id,
            amountCoins: pendingPayout.amountCoins,
            status: pendingPayout.status,
            createdAt: pendingPayout.createdAt,
          }
        : null,
    });
  } catch (err) {
    console.error("getCreatorDashboard error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Error interno del servidor" });
  }
};

// POST /api/creator/request — submit a creator access request (normal users only)
exports.submitCreatorRequest = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ ok: false, message: "Usuario no encontrado" });

    if (user.role !== "user") {
      return res.status(400).json({ ok: false, message: "Solo los usuarios normales pueden solicitar ser creadores" });
    }

    if (user.creatorStatus === "pending") {
      return res.status(400).json({ ok: false, message: "Ya tienes una solicitud de creador pendiente" });
    }

    if (user.creatorStatus === "approved") {
      return res.status(400).json({ ok: false, message: "Ya eres un creador aprobado" });
    }

    const { displayName, bio, category, country, languages, socialLinks } = req.body;

    if (!displayName || !displayName.trim()) {
      return res.status(400).json({ ok: false, message: "El nombre de creador es requerido" });
    }
    if (!bio || !bio.trim()) {
      return res.status(400).json({ ok: false, message: "La biografía es requerida" });
    }
    if (!category || !category.trim()) {
      return res.status(400).json({ ok: false, message: "La categoría es requerida" });
    }
    if (!country || !country.trim()) {
      return res.status(400).json({ ok: false, message: "El país es requerido" });
    }
    if (!languages || !Array.isArray(languages) || languages.length === 0) {
      return res.status(400).json({ ok: false, message: "Debes seleccionar al menos un idioma" });
    }

    const filteredLanguages = languages.filter((l) => l && l.trim());
    if (filteredLanguages.length === 0) {
      return res.status(400).json({ ok: false, message: "Debes seleccionar al menos un idioma válido" });
    }

    const sanitizedSocialLinks = {
      twitter: (socialLinks?.twitter || "").trim(),
      instagram: (socialLinks?.instagram || "").trim(),
      tiktok: (socialLinks?.tiktok || "").trim(),
      youtube: (socialLinks?.youtube || "").trim(),
    };

    user.creatorApplication = {
      displayName: displayName.trim(),
      bio: bio.trim(),
      category: category.trim(),
      country: country.trim(),
      languages: filteredLanguages.map((l) => l.trim()),
      socialLinks: sanitizedSocialLinks,
      submittedAt: new Date(),
    };
    user.creatorStatus = "pending";
    await user.save();

    return res.json({
      ok: true,
      message: "Solicitud enviada correctamente. Un administrador la revisará pronto.",
      creatorStatus: user.creatorStatus,
    });
  } catch (err) {
    console.error("submitCreatorRequest error:", err);
    return res.status(500).json({ ok: false, message: "Error interno del servidor" });
  }
};

// GET /api/creator/request-status — get current user's creator request status
exports.getCreatorRequestStatus = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select(
      "role creatorStatus creatorApplication creatorApprovedAt"
    );
    if (!user) return res.status(404).json({ ok: false, message: "Usuario no encontrado" });

    return res.json({
      ok: true,
      role: user.role,
      creatorStatus: user.creatorStatus,
      submittedAt: user.creatorApplication?.submittedAt || null,
      approvedAt: user.creatorApprovedAt || null,
    });
  } catch (err) {
    console.error("getCreatorRequestStatus error:", err);
    return res.status(500).json({ ok: false, message: "Error interno del servidor" });
  }
};
