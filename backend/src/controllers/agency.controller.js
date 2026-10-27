const mongoose = require("mongoose");
const User = require("../models/User.js");
const AgencyRelationship = require("../models/AgencyRelationship.js");
const CoinTransaction = require("../models/CoinTransaction.js");
const { isValidPercentage, MIN_AGENCY_PERCENTAGE, MAX_AGENCY_PERCENTAGE } = require("../services/agency.service.js");
const { clearSnapshot, finalizeIfReady } = require("../services/agencyRelationshipState.service.js");

// ── Concurrency helpers (percentage proposal accept/decline) ─────────────────
// Mirrors the retry-on-write-conflict pattern used by dailyReward.controller.js
// for transactional, idempotent writes under concurrent requests.
const MAX_TX_RETRIES = 3;
const TX_RETRY_BACKOFF_MS = 40;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isWriteConflictError(err) {
  if (!err) return false;
  if (err.code === 112) return true;
  if (typeof err.message === "string" && err.message.includes("Write conflict")) return true;
  if (typeof err.hasErrorLabel === "function" && err.hasErrorLabel("TransientTransactionError")) return true;
  if (typeof err.hasErrorLabel === "function" && err.hasErrorLabel("UnknownTransactionCommitResult")) return true;
  return false;
}

// Both accept and decline MUST be bound to the exact proposal the sub-creator saw and is
// confirming — never "whatever proposal happens to be pending right now". We deliberately
// reuse the two fields the proposal is already made of (`pendingPercentage` +
// `pendingPercentageProposedAt`, which together uniquely identify a single in-flight proposal,
// since a relationship can only ever have one pending proposal at a time) instead of introducing
// a brand-new versioning concept. Both are now mandatory, not optional.
function requireExpectedProposal(body) {
  const { expectedPercentage, expectedProposedAt } = body || {};
  if (expectedPercentage === undefined || expectedPercentage === null || expectedProposedAt === undefined || expectedProposedAt === null || expectedProposedAt === "") {
    return {
      error: {
        status: 400,
        message: "Debes confirmar expectedPercentage y expectedProposedAt de la propuesta exacta que estás respondiendo",
      },
    };
  }
  const pct = Number(expectedPercentage);
  if (!Number.isFinite(pct)) {
    return { error: { status: 400, message: "expectedPercentage inválido" } };
  }
  const proposedAt = new Date(expectedProposedAt);
  if (Number.isNaN(proposedAt.getTime())) {
    return { error: { status: 400, message: "expectedProposedAt inválido" } };
  }
  return { value: { pct, proposedAt } };
}

const VISIBLE_MY_RELATIONSHIP_STATUSES = ["pending", "active", "suspended"];

// GET /api/agency/invite-info?code=X — public, no auth required
// Returns basic info about the creator who owns the invite code
const getInviteInfo = async (req, res) => {
  try {
    const rawCode = typeof req.query.code === "string" ? req.query.code.trim().toUpperCase() : "";
    if (!rawCode) {
      return res.status(400).json({ message: "Código de invitación requerido" });
    }
    // Validate code format: alphanumeric, 4-20 chars
    if (!/^[A-Z0-9]{4,20}$/.test(rawCode)) {
      return res.status(400).json({ valid: false, message: "Código de invitación inválido" });
    }

    const creator = await User.findOne({
      "agencyProfile.agencyCode": rawCode,
      role: "creator",
      creatorStatus: "approved",
    }).select("username name avatar agencyProfile");

    if (!creator) {
      return res.status(404).json({ valid: false, message: "Código de invitación no encontrado o inválido" });
    }

    res.json({
      valid: true,
      creator: {
        username: creator.username,
        name: creator.name,
        avatar: creator.avatar || null,
        agencyName: creator.agencyProfile?.agencyName || null,
        agencyCode: rawCode,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/agency/me — agency profile + status for any approved creator
const getMyAgency = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select(
      "username name avatar role creatorStatus agencyProfile agencyEarningsCoins totalAgencyGeneratedCoins"
    );
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    if (user.role !== "creator" || user.creatorStatus !== "approved") {
      return res.status(403).json({ message: "Solo los creadores aprobados pueden acceder al perfil de agencia" });
    }

    const relationships = await AgencyRelationship.find({
      parentCreator: req.userId,
      status: { $in: ["pending", "active"] },
    }).populate("subCreator", "username name avatar creatorStatus earningsCoins");

    const counts = {
      total: relationships.length,
      active: relationships.filter((r) => r.status === "active").length,
      pending: relationships.filter((r) => r.status === "pending").length,
    };

    res.json({
      agencyEnabled: !!user.agencyProfile?.enabled,
      agencyProfile: user.agencyProfile,
      agencyEarningsCoins: user.agencyEarningsCoins || 0,
      totalAgencyGeneratedCoins: user.totalAgencyGeneratedCoins || 0,
      subCreators: relationships,
      counts,
      // Own identity, so the invitation/agreement preview can show both parties.
      me: { username: user.username, name: user.name, avatar: user.avatar || null },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/agency/search-creators?q=X — search approved creators by username/name to invite as sub-creator
// Only returns creators eligible to be linked: approved, not agency-enabled, not the requester,
// and not already in a pending/active/suspended relationship with any agency.
const searchCreators = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("role creatorStatus");
    if (!user || user.role !== "creator" || user.creatorStatus !== "approved") {
      return res.status(403).json({ message: "Solo los creadores aprobados pueden buscar sub-creadores" });
    }

    const rawQuery = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (rawQuery.length < 2) {
      return res.json({ results: [] });
    }
    if (rawQuery.length > 50) {
      return res.status(400).json({ message: "Búsqueda demasiado larga" });
    }

    // Escape regex special characters from user input before building the query
    const escaped = rawQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(escaped, "i");

    const candidates = await User.find({
      _id: { $ne: req.userId },
      role: "creator",
      creatorStatus: "approved",
      $or: [{ username: pattern }, { name: pattern }],
    })
      .select("_id username name avatar agencyProfile")
      .limit(15)
      .lean();

    const eligible = candidates.filter((c) => !c.agencyProfile?.enabled);
    const eligibleIds = eligible.map((c) => c._id);

    const takenIds = new Set();
    if (eligibleIds.length > 0) {
      const existingLinks = await AgencyRelationship.find({
        subCreator: { $in: eligibleIds },
        status: { $in: ["pending", "active", "suspended"] },
      }).select("subCreator").lean();
      existingLinks.forEach((l) => takenIds.add(String(l.subCreator)));
    }

    const results = eligible
      .filter((c) => !takenIds.has(String(c._id)))
      .slice(0, 10)
      .map((c) => ({ _id: c._id, username: c.username, name: c.name, avatar: c.avatar || null }));

    res.json({ results });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/agency/sub-creators — list sub-creators for any approved creator
const getSubCreators = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("role creatorStatus");
    if (!user || user.role !== "creator" || user.creatorStatus !== "approved") {
      return res.status(403).json({ message: "Solo los creadores aprobados pueden ver sus sub-creadores" });
    }

    const allowedStatuses = ["pending", "active", "suspended", "removed"];
    const filter = { parentCreator: req.userId };
    const requestedStatus = typeof req.query.status === "string" ? req.query.status : "";
    if (requestedStatus && allowedStatuses.includes(requestedStatus)) {
      filter.status = requestedStatus;
    } else {
      filter.status = { $in: ["pending", "active"] };
    }

    const relationships = await AgencyRelationship.find(filter)
      .populate("subCreator", "username name avatar creatorStatus earningsCoins")
      .sort({ createdAt: -1 });
    res.json({ relationships });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/agency/link (also /invite for backward compat) — approved creator links another as sub-creator
// Body: { subCreatorId, percentage, notes? }
const inviteSubCreator = async (req, res) => {
  const { subCreatorId, percentage, notes } = req.body;

  if (!subCreatorId) {
    return res.status(400).json({ message: "subCreatorId es requerido" });
  }
  if (!mongoose.Types.ObjectId.isValid(subCreatorId)) {
    return res.status(400).json({ message: "subCreatorId inválido" });
  }

  const pct = Number(percentage);
  if (!isValidPercentage(pct)) {
    return res.status(400).json({
      message: `El porcentaje debe ser un número entero entre ${MIN_AGENCY_PERCENTAGE} y ${MAX_AGENCY_PERCENTAGE}`,
    });
  }

  try {
    const agencyCreator = await User.findById(req.userId);
    if (!agencyCreator || agencyCreator.role !== "creator" || agencyCreator.creatorStatus !== "approved") {
      return res.status(403).json({ message: "Solo creadores aprobados pueden actuar como agencia" });
    }

    // Self-link prevention
    if (String(req.userId) === String(subCreatorId)) {
      return res.status(400).json({ message: "No puedes vincularte a ti mismo" });
    }

    const subCreator = await User.findById(subCreatorId);
    if (!subCreator || subCreator.role !== "creator" || subCreator.creatorStatus !== "approved") {
      return res.status(400).json({ message: "El sub-creador debe ser un creador aprobado" });
    }

    // Prevent multi-level: a sub-creator cannot also be an agency
    if (subCreator.agencyProfile?.enabled) {
      return res.status(400).json({ message: "Un creador habilitado como agencia no puede ser sub-creador" });
    }

    // Prevent circular: agency creator must not already be a sub-creator
    if (agencyCreator.agencyRelationship?.parentCreatorId) {
      return res.status(400).json({ message: "Una agencia no puede ser también sub-creador de otra agencia" });
    }

    // One-parent-only: sub-creator must not already have an active or pending relationship
    const existing = await AgencyRelationship.findOne({
      subCreator: subCreatorId,
      status: { $in: ["pending", "active", "suspended"] },
    });
    if (existing) {
      return res.status(400).json({ message: "Este creador ya está vinculado a una agencia" });
    }

    const relationship = await AgencyRelationship.create({
      parentCreator: req.userId,
      subCreator: subCreatorId,
      percentage: pct,
      status: "pending",
      createdBy: req.userId,
      notes: notes || "",
    });

    await relationship.populate("subCreator", "username name avatar");
    await relationship.populate("parentCreator", "username name avatar");

    res.status(201).json({ message: "Invitación enviada. Pendiente de aprobación por el administrador.", relationship });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: "Este creador ya tiene una relación de agencia registrada" });
    }
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/agency/sub-creators/:id/percentage — propose a new percentage for an active sub-creator
// :id = AgencyRelationship._id
// Allowed: parent creator or admin. The change is NEVER applied unilaterally — it is stored as a
// pending proposal and only takes effect once the sub-creator explicitly accepts it
// (see acceptPercentageChange). The currently agreed percentage keeps being used for commissions.
const updateSubCreatorPercentage = async (req, res) => {
  const { percentage } = req.body;
  const pct = Number(percentage);
  if (!isValidPercentage(pct)) {
    return res.status(400).json({
      message: `El porcentaje debe ser un número entero entre ${MIN_AGENCY_PERCENTAGE} y ${MAX_AGENCY_PERCENTAGE}`,
    });
  }

  try {
    const relationship = await AgencyRelationship.findById(req.params.id);
    if (!relationship) return res.status(404).json({ message: "Relación no encontrada" });

    const requestingUser = await User.findById(req.userId).select("role");
    const isAdmin = requestingUser && requestingUser.role === "admin";

    if (!isAdmin && String(relationship.parentCreator) !== String(req.userId)) {
      return res.status(403).json({ message: "No tienes permiso para modificar esta relación" });
    }
    if (relationship.status !== "active") {
      return res.status(400).json({ message: "Solo puedes modificar relaciones activas" });
    }
    if (pct === relationship.percentage) {
      return res.status(400).json({ message: "El nuevo porcentaje debe ser diferente al actual" });
    }

    // Atomic CAS: only writes the proposal if the relationship is still active
    // and still agreed at the percentage we just read. This closes the
    // read-modify-write race window that existed with find → mutate → save.
    const updated = await AgencyRelationship.findOneAndUpdate(
      { _id: relationship._id, status: "active", percentage: relationship.percentage },
      {
        $set: {
          pendingPercentage: pct,
          pendingPercentageProposedBy: req.userId,
          pendingPercentageProposedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!updated) {
      // Something changed concurrently (e.g. the previous proposal was just
      // accepted, changing `percentage`) — ask the caller to retry with fresh data.
      return res.status(409).json({
        message: "La relación cambió mientras preparabas la propuesta. Vuelve a intentarlo con los datos actualizados.",
      });
    }

    await updated.populate("subCreator", "username name avatar creatorStatus earningsCoins");

    res.json({
      message: "Propuesta de cambio de porcentaje enviada. Se aplicará solo si el sub-creador la acepta.",
      relationship: updated,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/agency/sub-creators/:id/percentage/cancel — proposer (parent creator or admin)
// withdraws a pending proposal before the sub-creator has responded (e.g. to fix a typo or
// abandon a stale negotiation). Atomic and idempotent: a second call safely 404s.
const cancelPercentageChange = async (req, res) => {
  try {
    const relationship = await AgencyRelationship.findById(req.params.id);
    if (!relationship) return res.status(404).json({ message: "Relación no encontrada" });

    const requestingUser = await User.findById(req.userId).select("role");
    const isAdmin = requestingUser && requestingUser.role === "admin";
    if (!isAdmin && String(relationship.parentCreator) !== String(req.userId)) {
      return res.status(403).json({ message: "No tienes permiso para modificar esta relación" });
    }

    const updated = await AgencyRelationship.findOneAndUpdate(
      { _id: relationship._id, pendingPercentage: { $ne: null } },
      { $set: { pendingPercentage: null, pendingPercentageProposedBy: null, pendingPercentageProposedAt: null } },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ message: "No hay una propuesta pendiente para cancelar" });
    }

    await updated.populate("subCreator", "username name avatar creatorStatus earningsCoins");
    res.json({ message: "Propuesta de porcentaje cancelada", relationship: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/agency/my-relationship/percentage/accept — sub-creator accepts a pending percentage proposal
//
// Hardened against: concurrent double-accept, stale proposals (the client MUST send
// `expectedPercentage`/`expectedProposedAt` matching exactly what it displayed — an accept is
// rejected with 409 if the proposal changed, was cancelled, or was replaced underneath it), and
// partial writes between the AgencyRelationship mutation and the User snapshot sync — both
// happen inside one mongoose transaction, retried on transient write conflicts.
const acceptPercentageChange = async (req, res) => {
  const parsed = requireExpectedProposal(req.body);
  if (parsed.error) return res.status(parsed.error.status).json({ message: parsed.error.message });
  const { pct: expectedPct, proposedAt: expectedProposedAt } = parsed.value;

  for (let attempt = 1; attempt <= MAX_TX_RETRIES; attempt++) {
    const session = await mongoose.startSession();
    try {
      let relationship = null;
      let staleProposal = false;

      await session.withTransaction(async () => {
        const matchFilter = {
          subCreator: req.userId,
          status: "active",
          pendingPercentage: expectedPct,
          pendingPercentageProposedAt: expectedProposedAt,
        };

        // Single atomic read+write using an aggregation pipeline update so the new
        // `percentage` and the appended `percentageHistory` entry are derived from the
        // document's own current fields in the same operation — no intermediate state
        // is ever observable, and a second concurrent accept simply won't match (idempotent).
        relationship = await AgencyRelationship.findOneAndUpdate(
          matchFilter,
          [
            {
              $set: {
                percentageHistory: {
                  $concatArrays: [
                    { $ifNull: ["$percentageHistory", []] },
                    [
                      {
                        percentage: "$percentage",
                        changedBy: "$pendingPercentageProposedBy",
                        changedAt: "$$NOW",
                      },
                    ],
                  ],
                },
                percentage: "$pendingPercentage",
                pendingPercentage: null,
                pendingPercentageProposedBy: null,
                pendingPercentageProposedAt: null,
              },
            },
          ],
          { new: true, session }
        );

        if (!relationship) {
          // Distinguish "nothing pending at all" from "a different/newer proposal is now
          // pending" purely for messaging — the write itself was already safely rejected either way.
          const stillPending = await AgencyRelationship.exists({
            subCreator: req.userId,
            status: "active",
            pendingPercentage: { $ne: null },
          }).session(session);
          if (stillPending) staleProposal = true;
          return;
        }

        // Keep the denormalized snapshot on the sub-creator document in sync, atomically
        // with the relationship write.
        await User.findByIdAndUpdate(
          relationship.subCreator,
          { "agencyRelationship.parentCreatorPercentage": relationship.percentage },
          { session }
        );
      });

      if (!relationship) {
        if (staleProposal) {
          return res.status(409).json({
            message: "La propuesta cambió antes de que la aceptaras. Revisa los nuevos datos e inténtalo de nuevo.",
          });
        }
        return res.status(404).json({ message: "No tienes una propuesta de porcentaje pendiente" });
      }

      await relationship.populate("parentCreator", "username name avatar agencyProfile");
      return res.json({ message: "Nuevo porcentaje aceptado y aplicado", relationship });
    } catch (err) {
      if (isWriteConflictError(err) && attempt < MAX_TX_RETRIES) {
        await sleep(TX_RETRY_BACKOFF_MS * attempt);
        continue;
      }
      return res.status(500).json({ message: err.message });
    } finally {
      await session.endSession();
    }
  }
};

// PATCH /api/agency/my-relationship/percentage/decline — sub-creator rejects a pending percentage proposal
// The previously agreed percentage remains unchanged. Single-document atomic update: a repeated
// or concurrent decline call simply finds nothing pending and safely 404s (idempotent). Like
// accept, the caller MUST confirm the exact `expectedPercentage`/`expectedProposedAt` it saw.
const declinePercentageChange = async (req, res) => {
  try {
    const parsed = requireExpectedProposal(req.body);
    if (parsed.error) return res.status(parsed.error.status).json({ message: parsed.error.message });
    const { pct: expectedPct, proposedAt: expectedProposedAt } = parsed.value;

    const matchFilter = {
      subCreator: req.userId,
      status: "active",
      pendingPercentage: expectedPct,
      pendingPercentageProposedAt: expectedProposedAt,
    };

    const relationship = await AgencyRelationship.findOneAndUpdate(
      matchFilter,
      { $set: { pendingPercentage: null, pendingPercentageProposedBy: null, pendingPercentageProposedAt: null } },
      { new: true }
    );
    if (!relationship) {
      const stillPending = await AgencyRelationship.exists({
        subCreator: req.userId,
        status: "active",
        pendingPercentage: { $ne: null },
      });
      if (stillPending) {
        return res.status(409).json({
          message: "La propuesta cambió antes de que la rechazaras. Revisa los nuevos datos e inténtalo de nuevo.",
        });
      }
      return res.status(404).json({ message: "No tienes una propuesta de porcentaje pendiente" });
    }

    await relationship.populate("parentCreator", "username name avatar agencyProfile");
    res.json({ message: "Propuesta de porcentaje rechazada. Se mantiene el porcentaje anterior.", relationship });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/agency/sub-creators/:id/remove — agency creator requests removal of sub-creator
const removeSubCreator = async (req, res) => {
  try {
    const relationship = await AgencyRelationship.findById(req.params.id);
    if (!relationship) return res.status(404).json({ message: "Relación no encontrada" });
    if (String(relationship.parentCreator) !== String(req.userId)) {
      return res.status(403).json({ message: "No tienes permiso para modificar esta relación" });
    }
    if (relationship.status === "removed") {
      return res.status(400).json({ message: "La relación ya está eliminada" });
    }

    const wasActive = relationship.status === "active";
    relationship.status = "removed";
    relationship.removedAt = new Date();
    await relationship.save();

    // Clear snapshot on sub-creator
    await clearSnapshot(relationship.subCreator);

    // Decrement sub-creator count
    if (wasActive) {
      await User.findByIdAndUpdate(req.userId, {
        $inc: { "agencyProfile.subCreatorsCount": -1 },
      });
    }

    res.json({ message: "Sub-creador eliminado de la agencia" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/agency/my-relationship — for a sub-creator to view their parent agency
const getMyRelationship = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("agencyRelationship");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    const relationship = await AgencyRelationship.findOne({
      subCreator: req.userId,
      status: { $in: VISIBLE_MY_RELATIONSHIP_STATUSES },
    })
      .populate("parentCreator", "username name avatar agencyProfile");
    res.json({ relationship });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/agency/my-relationship/accept — sub-creator formally accepts a pending invitation
const acceptRelationship = async (req, res) => {
  try {
    const relationship = await AgencyRelationship.findOne({
      subCreator: req.userId,
      status: { $in: ["pending", "active"] },
    });
    if (!relationship) {
      return res.status(404).json({ message: "No tienes una invitación pendiente" });
    }
    if (relationship.subCreatorAgreed) {
      return res.status(400).json({ message: "Ya aceptaste este acuerdo de comisión" });
    }

    relationship.subCreatorAgreed = true;
    relationship.subCreatorAgreedAt = new Date();
    const activated = await finalizeIfReady(relationship);

    await relationship.populate("parentCreator", "username name avatar agencyProfile");
    res.json({
      message: activated
        ? "Has aceptado el acuerdo de comisión. La relación de agencia está activa."
        : "Has aceptado el acuerdo de comisión. Pendiente de aprobación del administrador.",
      relationship,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/agency/my-relationship/decline — sub-creator declines a pending invitation
const declineRelationship = async (req, res) => {
  try {
    const relationship = await AgencyRelationship.findOne({
      subCreator: req.userId,
      status: { $in: ["pending", "active"] },
      subCreatorAgreed: false,
    });
    if (!relationship) {
      return res.status(404).json({ message: "No tienes una invitación pendiente" });
    }

    const wasActive = relationship.status === "active";
    relationship.status = "removed";
    relationship.removedAt = new Date();
    await relationship.save();
    await clearSnapshot(relationship.subCreator);
    if (wasActive) {
      await User.findByIdAndUpdate(relationship.parentCreator, {
        $inc: { "agencyProfile.subCreatorsCount": -1 },
      });
    }

    res.json({ message: "Has rechazado la invitación de agencia." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/agency/commission-history — paginated list of agency_earned transactions for current creator
const getCommissionHistory = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("role creatorStatus");
    if (!user || user.role !== "creator" || user.creatorStatus !== "approved") {
      return res.status(403).json({ message: "Solo los creadores aprobados pueden ver el historial de comisiones" });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      CoinTransaction.find({ userId: req.userId, type: "agency_earned" })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CoinTransaction.countDocuments({ userId: req.userId, type: "agency_earned" }),
    ]);

    // Enrich each transaction with sub-creator username if metadata.subCreatorId is present
    const subCreatorIds = [...new Set(
      transactions
        .map((t) => t.metadata?.subCreatorId)
        .filter((id) => id && mongoose.Types.ObjectId.isValid(id))
    )].map((id) => new mongoose.Types.ObjectId(id));

    let subCreatorMap = {};
    if (subCreatorIds.length > 0) {
      const subCreators = await User.find({ _id: { $in: subCreatorIds } })
        .select("username name avatar")
        .lean();
      subCreators.forEach((sc) => { subCreatorMap[String(sc._id)] = sc; });
    }

    const enriched = transactions.map((t) => ({
      ...t,
      subCreator: t.metadata?.subCreatorId ? subCreatorMap[t.metadata.subCreatorId] || null : null,
    }));

    res.json({ transactions: enriched, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/agency/top-sub-creators — top 5 sub-creators by coins generated for this agency creator
const getTopSubCreators = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("role creatorStatus");
    if (!user || user.role !== "creator" || user.creatorStatus !== "approved") {
      return res.status(403).json({ message: "Solo los creadores aprobados pueden ver el ranking" });
    }

    // Aggregate agency_earned transactions by subCreatorId from metadata
    const agg = await CoinTransaction.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(req.userId), type: "agency_earned" } },
      {
        $group: {
          _id: "$metadata.subCreatorId",
          totalCommission: { $sum: "$amount" },
          count: { $sum: 1 },
          lastAt: { $max: "$createdAt" },
        },
      },
      { $sort: { totalCommission: -1 } },
      { $limit: 5 },
    ]);

    // Enrich with sub-creator user info
    const ids = agg
      .filter((a) => a._id && mongoose.Types.ObjectId.isValid(a._id))
      .map((a) => new mongoose.Types.ObjectId(a._id));

    let userMap = {};
    if (ids.length > 0) {
      const users = await User.find({ _id: { $in: ids } })
        .select("username name avatar creatorStatus")
        .lean();
      users.forEach((u) => { userMap[String(u._id)] = u; });
    }

    const top = agg.map((a) => ({
      subCreatorId: a._id,
      subCreator: a._id ? userMap[a._id] || null : null,
      totalCommission: a.totalCommission,
      transactionCount: a.count,
      lastAt: a.lastAt,
    }));

    res.json({ top });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getInviteInfo,
  getMyAgency,
  getSubCreators,
  searchCreators,
  inviteSubCreator,
  updateSubCreatorPercentage,
  cancelPercentageChange,
  acceptPercentageChange,
  declinePercentageChange,
  removeSubCreator,
  getMyRelationship,
  acceptRelationship,
  declineRelationship,
  getCommissionHistory,
  getTopSubCreators,
};
