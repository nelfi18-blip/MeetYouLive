const mongoose = require("mongoose");
const User = require("../models/User.js");
const AgencyRelationship = require("../models/AgencyRelationship.js");
const { isValidPercentage, MIN_AGENCY_PERCENTAGE, MAX_AGENCY_PERCENTAGE } = require("../services/agency.service.js");

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
    });
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

// PATCH /api/agency/sub-creators/:id/percentage — update percentage for active sub-creator
// :id = AgencyRelationship._id
// Allowed: parent creator or admin
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

    relationship.percentageHistory.push({ percentage: relationship.percentage, changedBy: req.userId });
    relationship.percentage = pct;
    await relationship.save();

    // Also update the snapshot on the sub-creator document
    await User.findByIdAndUpdate(relationship.subCreator, {
      "agencyRelationship.parentCreatorPercentage": pct,
    });

    res.json({ message: "Porcentaje actualizado", relationship });
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

    relationship.status = "removed";
    relationship.removedAt = new Date();
    await relationship.save();

    // Clear snapshot on sub-creator
    await User.findByIdAndUpdate(relationship.subCreator, {
      "agencyRelationship.parentCreatorId": null,
      "agencyRelationship.parentCreatorPercentage": 0,
      "agencyRelationship.joinedAt": null,
      "agencyRelationship.status": "removed",
    });

    // Decrement sub-creator count
    await User.findByIdAndUpdate(req.userId, {
      $inc: { "agencyProfile.subCreatorsCount": -1 },
    });

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

    const rel = user.agencyRelationship;
    if (!rel || !rel.parentCreatorId) {
      return res.json({ relationship: null });
    }

    const relationship = await AgencyRelationship.findOne({ subCreator: req.userId })
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
      status: "pending",
    });
    if (!relationship) {
      return res.status(404).json({ message: "No tienes una invitación pendiente" });
    }

    relationship.subCreatorAgreed = true;
    relationship.subCreatorAgreedAt = new Date();
    await relationship.save();

    await relationship.populate("parentCreator", "username name avatar agencyProfile");
    res.json({ message: "Has aceptado el acuerdo de comisión. Pendiente de aprobación del administrador.", relationship });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/agency/my-relationship/decline — sub-creator declines a pending invitation
const declineRelationship = async (req, res) => {
  try {
    const relationship = await AgencyRelationship.findOne({
      subCreator: req.userId,
      status: "pending",
    });
    if (!relationship) {
      return res.status(404).json({ message: "No tienes una invitación pendiente" });
    }

    relationship.status = "removed";
    relationship.removedAt = new Date();
    await relationship.save();

    res.json({ message: "Has rechazado la invitación de agencia." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getMyAgency,
  getSubCreators,
  inviteSubCreator,
  updateSubCreatorPercentage,
  removeSubCreator,
  getMyRelationship,
  acceptRelationship,
  declineRelationship,
};
