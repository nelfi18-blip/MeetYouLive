const Call = require("../models/Call");
const User = require("../models/User");
const CoinTransaction = require("../models/CoinTransaction");
const AgencyRelationship = require("../models/AgencyRelationship");
const { calculateSplit } = require("../services/agency.service");

exports.createCall = async (req, res) => {
  try {
    const callerId = req.user.id;
    const { recipientId } = req.body;

    if (!recipientId) {
      return res.status(400).json({ message: "Falta recipientId" });
    }

    if (callerId === recipientId) {
      return res.status(400).json({ message: "No puedes llamarte a ti mismo" });
    }

    const [caller, receiver] = await Promise.all([
      User.findById(callerId),
      User.findById(recipientId),
    ]);

    if (!receiver) {
      return res.status(404).json({ message: "Creador no encontrado" });
    }

    if (receiver.role !== "creator" || receiver.creatorStatus !== "approved") {
      return res.status(403).json({ message: "No es un creador aprobado" });
    }

    if (!receiver.creatorProfile?.privateCallEnabled) {
      return res.status(400).json({ message: "Este creador no acepta llamadas privadas" });
    }

    const pricePerMinute = receiver.creatorProfile.pricePerMinute || 10;

    if (!caller || caller.coins < pricePerMinute) {
      return res.status(400).json({ message: "Coins insuficientes para iniciar la llamada" });
    }

    const call = await Call.create({
      caller: callerId,
      receiver: recipientId,
      pricePerMinute,
    });

    res.json(call);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creando llamada" });
  }
};

exports.endCall = async (req, res) => {
  try {
    const call = await Call.findById(req.params.id);

    if (!call) return res.status(404).json({ message: "Llamada no encontrada" });

    const userId = req.user.id;
    if (call.caller.toString() !== userId && call.receiver.toString() !== userId) {
      return res.status(403).json({ message: "No autorizado" });
    }

    if (call.status === "ended") {
      return res.status(400).json({ message: "La llamada ya ha terminado" });
    }

    call.endedAt = new Date();
    call.status = "ended";

    const durationSeconds = Math.floor(
      (call.endedAt - call.startedAt) / 1000
    );

    call.totalDurationSeconds = durationSeconds;

    const minutes = Math.ceil(durationSeconds / 60);
    const totalCoins = minutes * call.pricePerMinute;
    call.totalCoinsCharged = totalCoins;

    const agencyRel = await AgencyRelationship.findOne({
      subCreator: call.receiver,
      status: "active",
    });

    const agencyPercentage = agencyRel ? agencyRel.percentage : null;
    const { platformShare, creatorNetShare, agencyShare } = calculateSplit(
      totalCoins,
      agencyPercentage
    );

    call.platformShare = platformShare;
    call.creatorShare = creatorNetShare;
    call.agencyShare = agencyShare;

    await User.findByIdAndUpdate(call.caller, {
      $inc: { coins: -totalCoins },
    });

    await User.findByIdAndUpdate(call.receiver, {
      $inc: { earningsCoins: creatorNetShare },
    });

    if (agencyRel && agencyShare > 0) {
      await User.findByIdAndUpdate(agencyRel.parentCreator, {
        $inc: {
          agencyEarningsCoins: agencyShare,
          totalAgencyGeneratedCoins: agencyShare,
        },
      });
    }

    const transactions = [
      {
        userId: call.caller,
        type: "private_call",
        amount: -totalCoins,
        reason: "Private call charge",
        metadata: { callId: call._id, durationSeconds, minutes },
      },
      {
        userId: call.receiver,
        type: "call_earned",
        amount: creatorNetShare,
        reason: "Private call earnings",
        metadata: { callId: call._id, durationSeconds, agencyShare },
      },
    ];

    if (agencyRel && agencyShare > 0) {
      transactions.push({
        userId: agencyRel.parentCreator,
        type: "agency_earned",
        amount: agencyShare,
        reason: "Agency commission from private call",
        metadata: { callId: call._id, subCreatorId: call.receiver },
      });
    }

    await CoinTransaction.create(transactions);

    await call.save();

    res.json({ success: true, call });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error finalizando llamada" });
  }
};
