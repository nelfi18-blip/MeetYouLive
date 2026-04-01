const User = require("../models/User.js");
const AccessPass = require("../models/AccessPass.js");
const SparkTransaction = require("../models/SparkTransaction.js");

// Full catalog of available access passes
const PASS_CATALOG = [
  {
    type: "backstage_pass",
    name: "Backstage Pass",
    sparkCost: 200,
    icon: "🎭",
    description: "Acceso exclusivo a experiencias detrás del escenario con tus creators favoritos",
    durationHours: 24,
  },
  {
    type: "vip_live_pass",
    name: "VIP Live Pass",
    sparkCost: 300,
    icon: "👑",
    description: "Entrada VIP a eventos en vivo premium y sesiones especiales",
    durationHours: 48,
  },
  {
    type: "private_date",
    name: "Private Date",
    sparkCost: 500,
    icon: "🌹",
    description: "Sesión privada exclusiva — Exclusive Moments garantizados",
    durationHours: 12,
  },
  {
    type: "inner_circle",
    name: "Inner Circle",
    sparkCost: 150,
    icon: "✨",
    description: "Acceso semanal a salas sociales temáticas y speed dating premium",
    durationHours: 168,
  },
];

const getCatalog = (req, res) => {
  res.json(PASS_CATALOG);
};

const getMyPasses = async (req, res) => {
  try {
    // Expire any passes that have passed their expiry time
    await AccessPass.updateMany(
      { holder: req.userId, status: "active", expiresAt: { $lte: new Date() } },
      { $set: { status: "expired" } }
    );

    const passes = await AccessPass.find({ holder: req.userId })
      .sort({ createdAt: -1 });
    res.json(passes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const purchasePass = async (req, res) => {
  const { passType } = req.body;
  const passInfo = PASS_CATALOG.find((p) => p.type === passType);
  if (!passInfo) {
    return res.status(400).json({ message: "Tipo de pase inválido" });
  }

  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    if (user.sparks < passInfo.sparkCost) {
      return res.status(400).json({ message: "Sparks insuficientes para comprar este pase" });
    }

    await User.findByIdAndUpdate(req.userId, { $inc: { sparks: -passInfo.sparkCost } });

    const expiresAt = new Date(Date.now() + passInfo.durationHours * 60 * 60 * 1000);
    const pass = await AccessPass.create({
      holder: req.userId,
      type: passType,
      status: "active",
      sparkCost: passInfo.sparkCost,
      expiresAt,
    });

    SparkTransaction.create({
      userId: req.userId,
      type: "pass_purchase",
      amount: -passInfo.sparkCost,
      reason: `Pase adquirido: ${passInfo.name}`,
      status: "completed",
      metadata: { passType, passId: pass._id },
    }).catch((err) => console.error("[spark tx] Failed to record pass purchase:", err));

    res.status(201).json({ pass, passInfo });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getCatalog, getMyPasses, purchasePass, PASS_CATALOG };
