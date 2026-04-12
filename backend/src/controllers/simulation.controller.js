const mongoose = require("mongoose");
const SimulationResponse = require("../models/SimulationResponse.js");
const SimulationUnlock = require("../models/SimulationUnlock.js");
const User = require("../models/User.js");
const CoinTransaction = require("../models/CoinTransaction.js");

/* ── Scenario catalogue (hardcoded) ────────────────────────────────────── */
const SCENARIOS = [
  {
    id: "primer_mensaje",
    title: "Primer mensaje",
    description: "¿Cómo romperías el hielo con alguien que te gusta?",
    emoji: "👋",
    isPremium: false,
    coinCost: 0,
    tips: ["Sé auténtico/a", "Menciona algo de su perfil", "Haz una pregunta abierta"],
    prompt: "Escribe cómo empezarías una conversación con alguien que acabas de conocer…",
  },
  {
    id: "coquetear",
    title: "Cómo coquetear",
    description: "Practica cómo mostrar interés de forma natural y divertida.",
    emoji: "😏",
    isPremium: false,
    coinCost: 0,
    tips: ["Usa el humor", "Haz cumplidos específicos", "Mantén el misterio"],
    prompt: "Escribe un mensaje coqueto pero respetuoso para alguien que te gusta…",
  },
  {
    id: "continuar_conv",
    title: "Continuar la conversación",
    description: "¿Qué haces cuando la conversación empieza a enfriarse?",
    emoji: "💬",
    isPremium: false,
    coinCost: 0,
    tips: ["Cambia el tema con elegancia", "Comparte algo tuyo", "Haz preguntas curiosas"],
    prompt: "La conversación se está poniendo fría. ¿Qué mensaje enviarías para reactivarla?",
  },
  {
    id: "pedir_cita",
    title: "Pedir una cita",
    description: "Aprende a proponer un encuentro de forma segura y directa.",
    emoji: "📅",
    isPremium: false,
    coinCost: 0,
    tips: ["Sé directo/a pero amable", "Propón algo concreto", "Dale espacio para decidir"],
    prompt: "Escribe cómo le pedirías a alguien que salga contigo…",
  },
  {
    id: "superar_rechazo",
    title: "Superar el rechazo",
    description: "Cómo responder con clase cuando alguien no está interesado/a.",
    emoji: "💪",
    isPremium: true,
    coinCost: 50,
    tips: ["Acepta con dignidad", "Agradece la honestidad", "No lo tomes personal"],
    prompt: "Te acaban de rechazar con amabilidad. ¿Cómo responderías para quedar bien?",
  },
  {
    id: "cita_perfecta",
    title: "Planear la cita perfecta",
    description: "Ideas para proponer un plan que deje huella.",
    emoji: "✨",
    isPremium: true,
    coinCost: 75,
    tips: ["Personaliza según sus gustos", "Sugiere algo diferente", "Muestra que pensaste en él/ella"],
    prompt: "¿Cómo describirías el plan de cita perfecto para alguien que acabas de conocer?",
  },
];

const SCENARIO_MAP = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));

/* ── GET /api/simulation/scenarios ─────────────────────────────────────── */
const getScenarios = async (req, res) => {
  try {
    let unlockedIds = new Set();
    if (req.userId) {
      const unlocks = await SimulationUnlock.find({ user: req.userId }).select("scenarioId").lean();
      unlockedIds = new Set(unlocks.map((u) => u.scenarioId));
    }

    const list = SCENARIOS.map((s) => ({
      ...s,
      isUnlocked: !s.isPremium || unlockedIds.has(s.id),
    }));

    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ── GET /api/simulation/scenarios/:scenarioId/responses ────────────────── */
const getResponses = async (req, res) => {
  const { scenarioId } = req.params;
  if (!SCENARIO_MAP[scenarioId]) {
    return res.status(404).json({ message: "Escenario no encontrado" });
  }
  try {
    const limit = Math.min(Math.max(1, Number(req.query.limit) || 20), 50);
    const responses = await SimulationResponse.find({ scenarioId })
      .populate("user", "username name avatar")
      .sort({ likesCount: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    const currentUserId = req.userId ? String(req.userId) : null;
    const list = responses.map((r) => ({
      _id: r._id,
      scenarioId: r.scenarioId,
      user: { _id: r.user._id, username: r.user.username, name: r.user.name, avatar: r.user.avatar },
      text: r.text,
      likesCount: r.likesCount,
      likedByMe: currentUserId ? r.likedBy.some((id) => String(id) === currentUserId) : false,
      createdAt: r.createdAt,
    }));

    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ── POST /api/simulation/scenarios/:scenarioId/responses ──────────────── */
const postResponse = async (req, res) => {
  const { scenarioId } = req.params;
  const scenario = SCENARIO_MAP[scenarioId];
  if (!scenario) return res.status(404).json({ message: "Escenario no encontrado" });

  const { text } = req.body;
  if (!text || typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ message: "text es requerido" });
  }
  const sanitized = text.trim().slice(0, 600);

  try {
    // Check premium access
    if (scenario.isPremium) {
      const unlock = await SimulationUnlock.findOne({ user: req.userId, scenarioId });
      if (!unlock) {
        return res.status(403).json({ message: "Este escenario requiere desbloqueo", coinCost: scenario.coinCost });
      }
    }

    const sender = await User.findById(req.userId).select("username name avatar").lean();
    if (!sender) return res.status(401).json({ message: "Usuario no encontrado" });

    const response = await SimulationResponse.create({
      scenarioId,
      user: req.userId,
      text: sanitized,
    });

    res.status(201).json({
      _id: response._id,
      scenarioId,
      user: { _id: sender._id, username: sender.username, name: sender.name, avatar: sender.avatar },
      text: sanitized,
      likesCount: 0,
      likedByMe: false,
      createdAt: response.createdAt,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ── POST /api/simulation/responses/:id/like ───────────────────────────── */
const likeResponse = async (req, res) => {
  try {
    const response = await SimulationResponse.findById(req.params.id);
    if (!response) return res.status(404).json({ message: "Respuesta no encontrada" });

    const userId = req.userId;
    const alreadyLiked = response.likedBy.some((id) => String(id) === String(userId));

    if (alreadyLiked) {
      response.likedBy = response.likedBy.filter((id) => String(id) !== String(userId));
      response.likesCount = Math.max(0, response.likesCount - 1);
    } else {
      response.likedBy.push(userId);
      response.likesCount += 1;
    }

    await response.save();
    res.json({ likesCount: response.likesCount, likedByMe: !alreadyLiked });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ── POST /api/simulation/scenarios/:scenarioId/unlock ─────────────────── */
const unlockScenario = async (req, res) => {
  const { scenarioId } = req.params;
  const scenario = SCENARIO_MAP[scenarioId];

  if (!scenario) return res.status(404).json({ message: "Escenario no encontrado" });
  if (!scenario.isPremium) return res.status(400).json({ message: "Este escenario es gratuito" });

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const user = await User.findById(req.userId).session(session);
      if (!user) throw Object.assign(new Error("Usuario no encontrado"), { status: 401 });

      const existing = await SimulationUnlock.findOne({ user: req.userId, scenarioId }).session(session);
      if (existing) throw Object.assign(new Error("Escenario ya desbloqueado"), { status: 400 });

      if (user.coins < scenario.coinCost) {
        throw Object.assign(
          new Error(`Coins insuficientes. Necesitas ${scenario.coinCost} coins`),
          { status: 402 }
        );
      }

      user.coins -= scenario.coinCost;
      await user.save({ session });

      await SimulationUnlock.create([{ user: req.userId, scenarioId, coinsSpent: scenario.coinCost }], { session });

      await CoinTransaction.create(
        [
          {
            userId: req.userId,
            amount: -scenario.coinCost,
            type: "simulation_unlock",
            reason: `Desbloqueo de escenario: ${scenario.title}`,
          },
        ],
        { session }
      );

      result = { ok: true, scenarioId, coinsRemaining: user.coins };
    });

    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  } finally {
    await session.endSession();
  }
};

module.exports = { getScenarios, getResponses, postResponse, likeResponse, unlockScenario };
