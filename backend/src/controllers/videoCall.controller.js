const VideoCall = require("../models/VideoCall.js");
const Like = require("../models/Like.js");
const User = require("../models/User.js");
const CoinTransaction = require("../models/CoinTransaction.js");
const { calculateSplit } = require("../services/agency.service.js");

// 60% goes to the creator, 40% is the platform commission
const CREATOR_SHARE_RATE = 0.60;

// Helper: refund coins to caller for a paid call
const refundPaidCall = async (callerId, coins) => {
  if (coins > 0) {
    await User.findByIdAndUpdate(callerId, { $inc: { coins } });
  }
};

// POST /api/calls — create call invite
const inviteCall = async (req, res) => {
  const { recipientId, type, callCoins } = req.body;

  if (!recipientId) {
    return res.status(400).json({ message: "recipientId es requerido" });
  }
  if (String(recipientId) === String(req.userId)) {
    return res.status(400).json({ message: "No puedes llamarte a ti mismo" });
  }

  const callType = type === "paid_creator" ? "paid_creator" : "social";
  let coins = callType === "paid_creator" ? Math.max(0, parseInt(callCoins) || 0) : 0;
  let creatorPricePerMinute = 0;

  try {
    // For social calls: require mutual match
    if (callType === "social") {
      const iLiked = await Like.findOne({ from: req.userId, to: recipientId });
      const theyLiked = await Like.findOne({ from: recipientId, to: req.userId });
      if (!iLiked || !theyLiked) {
        return res.status(403).json({ message: "Solo puedes llamar a tus matches" });
      }
    }

    // For paid creator calls: recipient must be a creator with private calls enabled
    if (callType === "paid_creator") {
      const creator = await User.findOne({ _id: recipientId, role: "creator", creatorStatus: "approved" });
      if (!creator) {
        return res.status(403).json({ message: "El usuario no es un creador aprobado" });
      }
      if (!creator.creatorProfile?.privateCallEnabled) {
        return res.status(403).json({ message: "Este creador no tiene habilitadas las llamadas privadas" });
      }

      // Enforce callCoins = pricePerMinute (caller cannot set an arbitrary amount)
      creatorPricePerMinute = creator.creatorProfile.pricePerMinute || 0;
      if (creatorPricePerMinute < 1) {
        return res.status(403).json({ message: "Este creador no ha configurado un precio por minuto" });
      }
      coins = creatorPricePerMinute;
      // Deduct coins atomically using a conditional update
      const updated = await User.findOneAndUpdate(
        { _id: req.userId, coins: { $gte: coins } },
        { $inc: { coins: -coins } },
        { new: true }
      );
      if (!updated) {
        return res.status(402).json({ message: `Necesitas ${coins} monedas para esta llamada` });
      }

      // Record the initial coin deduction transaction (fire-and-forget)
      CoinTransaction.create({
        userId: req.userId,
        type: "private_call",
        amount: -coins,
        reason: `Llamada privada con creador ${recipientId} (primer minuto)`,
        status: "completed",
        metadata: { recipientId: String(recipientId) },
      }).catch((err) => console.error("[call tx] Failed to record initial deduction:", err));
    }

    // Cancel any existing pending calls between these users; refund coins for paid ones
    const pendingCalls = await VideoCall.find({
      $or: [
        { caller: req.userId, recipient: recipientId, status: "pending" },
        { caller: recipientId, recipient: req.userId, status: "pending" },
      ],
    });

    for (const pending of pendingCalls) {
      if (pending.type === "paid_creator") {
        await refundPaidCall(pending.caller, pending.callCoins);
      }
    }

    if (pendingCalls.length > 0) {
      const ids = pendingCalls.map((c) => c._id);
      await VideoCall.updateMany({ _id: { $in: ids } }, { status: "missed" });
    }

    const call = await VideoCall.create({
      caller: req.userId,
      recipient: recipientId,
      type: callType,
      callCoins: coins,
      pricePerMinute: creatorPricePerMinute,
    });

    const populated = await VideoCall.findById(call._id)
      .populate("caller", "username name avatar")
      .populate("recipient", "username name avatar");

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/calls/incoming — pending calls for current user
const getIncoming = async (req, res) => {
  try {
    const call = await VideoCall.findOne({
      recipient: req.userId,
      status: "pending",
    })
      .sort({ createdAt: -1 })
      .populate("caller", "username name avatar");

    res.json({ call: call || null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/calls/:id — get call details
const getCallById = async (req, res) => {
  try {
    const call = await VideoCall.findById(req.params.id)
      .populate("caller", "username name avatar")
      .populate("recipient", "username name avatar");

    if (!call) return res.status(404).json({ message: "Llamada no encontrada" });

    const isParticipant =
      String(call.caller._id) === String(req.userId) ||
      String(call.recipient._id) === String(req.userId);

    if (!isParticipant) {
      return res.status(403).json({ message: "No tienes acceso a esta llamada" });
    }

    res.json(call);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/calls/:id/respond — accept or reject
const respondCall = async (req, res) => {
  const { action } = req.body; // "accept" | "reject"
  if (!["accept", "reject"].includes(action)) {
    return res.status(400).json({ message: "action debe ser 'accept' o 'reject'" });
  }

  try {
    const call = await VideoCall.findById(req.params.id);
    if (!call) return res.status(404).json({ message: "Llamada no encontrada" });

    if (String(call.recipient) !== String(req.userId)) {
      return res.status(403).json({ message: "Solo el destinatario puede responder" });
    }

    if (call.status !== "pending") {
      return res.status(400).json({ message: "Esta llamada ya fue respondida" });
    }

    if (action === "accept") {
      call.status = "accepted";
      if (!call.startedAt) {
        call.startedAt = new Date();
      }

      // Credit creator for paid calls — 60% creator share, 40% platform
      if (call.type === "paid_creator" && call.callCoins > 0) {
        const fullCreatorShare = Math.floor(call.callCoins * CREATOR_SHARE_RATE);

        // Apply agency split if creator has an active parent agency
        const recipient = await User.findById(call.recipient);
        let creatorNetShare = fullCreatorShare;
        let agencyShare = 0;
        let parentCreatorId = null;

        if (recipient) {
          const rel = recipient.agencyRelationship;
          if (rel && rel.status === "active" && rel.parentCreatorId && rel.parentCreatorPercentage > 0) {
            const split = calculateSplit(call.callCoins, rel.parentCreatorPercentage);
            agencyShare = split.agencyShare;
            creatorNetShare = split.creatorNetShare;
            parentCreatorId = rel.parentCreatorId;
          }
        }

        await User.findByIdAndUpdate(call.recipient, {
          $inc: { earningsCoins: creatorNetShare },
        });

        if (agencyShare > 0 && parentCreatorId) {
          await User.findByIdAndUpdate(parentCreatorId, {
            $inc: { agencyEarningsCoins: agencyShare, totalAgencyGeneratedCoins: call.callCoins },
          });
        }

        // Record earnings transactions for creator (and agency) — fire-and-forget
        const txDocs = [
          {
            userId: call.recipient,
            type: "private_call",
            amount: creatorNetShare,
            reason: `Llamada privada aceptada de ${call.caller}`,
            status: "completed",
            metadata: { callId: String(call._id), callerUserId: String(call.caller) },
          },
        ];
        if (agencyShare > 0 && parentCreatorId) {
          txDocs.push({
            userId: parentCreatorId,
            type: "agency_earned",
            amount: agencyShare,
            reason: `Comisión de agencia por llamada privada`,
            status: "completed",
            metadata: { callId: String(call._id), subCreatorId: String(call.recipient) },
          });
        }
        CoinTransaction.create(txDocs).catch((err) => console.error("[call tx] Failed to record creator earning:", err));
      }
    } else {
      call.status = "rejected";
      // Refund caller coins if paid call is rejected
      if (call.type === "paid_creator") {
        await refundPaidCall(call.caller, call.callCoins);
      }
    }

    await call.save();

    const populated = await VideoCall.findById(call._id)
      .populate("caller", "username name avatar")
      .populate("recipient", "username name avatar");

    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/calls/:id/end — end an active call
const endCall = async (req, res) => {
  try {
    const call = await VideoCall.findById(req.params.id);
    if (!call) return res.status(404).json({ message: "Llamada no encontrada" });

    const isParticipant =
      String(call.caller) === String(req.userId) ||
      String(call.recipient) === String(req.userId);

    if (!isParticipant) {
      return res.status(403).json({ message: "No eres parte de esta llamada" });
    }

    if (!["pending", "accepted"].includes(call.status)) {
      return res.status(400).json({ message: "La llamada ya está finalizada" });
    }

    // Refund coins if paid call ended before fully accepted (caller hangs up while pending)
    if (call.status === "pending" && call.type === "paid_creator") {
      await refundPaidCall(call.caller, call.callCoins);
    }

    call.status = "ended";
    call.endedAt = new Date();
    await call.save();

    res.json(call);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/calls/:id/offer — caller submits WebRTC SDP offer
const submitOffer = async (req, res) => {
  const { offerSdp } = req.body;
  if (!offerSdp) return res.status(400).json({ message: "offerSdp es requerido" });

  try {
    const call = await VideoCall.findById(req.params.id);
    if (!call) return res.status(404).json({ message: "Llamada no encontrada" });

    if (String(call.caller) !== String(req.userId)) {
      return res.status(403).json({ message: "Solo el llamante puede enviar el offer" });
    }

    if (!["pending", "accepted"].includes(call.status)) {
      return res.status(400).json({ message: "La llamada no está activa" });
    }

    call.offerSdp = offerSdp;
    await call.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/calls/:id/answer — callee submits WebRTC SDP answer
const submitAnswer = async (req, res) => {
  const { answerSdp } = req.body;
  if (!answerSdp) return res.status(400).json({ message: "answerSdp es requerido" });

  try {
    const call = await VideoCall.findById(req.params.id);
    if (!call) return res.status(404).json({ message: "Llamada no encontrada" });

    if (String(call.recipient) !== String(req.userId)) {
      return res.status(403).json({ message: "Solo el destinatario puede enviar el answer" });
    }

    if (call.status !== "accepted") {
      return res.status(400).json({ message: "La llamada debe estar aceptada antes de enviar el answer" });
    }

    call.answerSdp = answerSdp;
    await call.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/calls/:id/candidates — submit ICE candidates
const addCandidates = async (req, res) => {
  const { candidates } = req.body; // array of ICE candidate objects
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return res.status(400).json({ message: "candidates debe ser un array no vacío" });
  }

  try {
    const call = await VideoCall.findById(req.params.id);
    if (!call) return res.status(404).json({ message: "Llamada no encontrada" });

    const isCaller = String(call.caller) === String(req.userId);
    const isRecipient = String(call.recipient) === String(req.userId);

    if (!isCaller && !isRecipient) {
      return res.status(403).json({ message: "No eres parte de esta llamada" });
    }

    const field = isCaller ? "callerCandidates" : "calleeCandidates";
    const stringified = candidates.map((c) =>
      typeof c === "string" ? c : JSON.stringify(c)
    );

    await VideoCall.findByIdAndUpdate(call._id, {
      $push: { [field]: { $each: stringified } },
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/calls/:id/candidates — get ICE candidates from the remote peer
const getCandidates = async (req, res) => {
  try {
    const call = await VideoCall.findById(req.params.id).select(
      "caller recipient callerCandidates calleeCandidates status"
    );
    if (!call) return res.status(404).json({ message: "Llamada no encontrada" });

    const isCaller = String(call.caller) === String(req.userId);
    const isRecipient = String(call.recipient) === String(req.userId);

    if (!isCaller && !isRecipient) {
      return res.status(403).json({ message: "No eres parte de esta llamada" });
    }

    // Return the OTHER party's candidates
    const remoteCandidates = isCaller ? call.calleeCandidates : call.callerCandidates;

    res.json({
      candidates: remoteCandidates,
      status: call.status,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/calls/:id/tick — per-minute billing for active paid calls
const tickCall = async (req, res) => {
  try {
    const call = await VideoCall.findById(req.params.id);
    if (!call) return res.status(404).json({ message: "Llamada no encontrada" });

    if (String(call.caller) !== String(req.userId)) {
      return res.status(403).json({ message: "Solo el llamante puede activar el tick de facturación" });
    }

    if (call.status !== "accepted") {
      return res.status(400).json({ message: "La llamada no está activa" });
    }

    if (call.type !== "paid_creator" || call.callCoins <= 0) {
      return res.status(400).json({ message: "Esta llamada no es de pago" });
    }

    const pricePerMinute = call.callCoins;
    const fullCreatorShare = Math.floor(pricePerMinute * CREATOR_SHARE_RATE);

    // Apply agency split if creator has an active parent agency
    const creatorUser = await User.findById(call.recipient);
    let creatorNetShare = fullCreatorShare;
    let agencyShare = 0;
    let parentCreatorId = null;

    if (creatorUser) {
      const rel = creatorUser.agencyRelationship;
      if (rel && rel.status === "active" && rel.parentCreatorId && rel.parentCreatorPercentage > 0) {
        const split = calculateSplit(pricePerMinute, rel.parentCreatorPercentage);
        agencyShare = split.agencyShare;
        creatorNetShare = split.creatorNetShare;
        parentCreatorId = rel.parentCreatorId;
      }
    }

    // Atomically deduct coins from caller
    const updatedCaller = await User.findOneAndUpdate(
      { _id: call.caller, coins: { $gte: pricePerMinute } },
      { $inc: { coins: -pricePerMinute } },
      { new: true }
    );

    if (!updatedCaller) {
      // Caller ran out of coins — end the call
      call.status = "ended";
      call.endedAt = new Date();
      await call.save();
      return res.status(402).json({ message: "Monedas insuficientes. La llamada ha sido finalizada.", ended: true });
    }

    // Credit creator (net share after agency)
    await User.findByIdAndUpdate(call.recipient, { $inc: { earningsCoins: creatorNetShare } });

    if (agencyShare > 0 && parentCreatorId) {
      await User.findByIdAndUpdate(parentCreatorId, {
        $inc: { agencyEarningsCoins: agencyShare, totalAgencyGeneratedCoins: pricePerMinute },
      });
    }

    // Record transactions (fire-and-forget)
    const txMeta = { callId: String(call._id) };
    const txDocs = [
      {
        userId: call.caller,
        type: "private_call",
        amount: -pricePerMinute,
        reason: `Minuto adicional en llamada privada con ${call.recipient}`,
        status: "completed",
        metadata: txMeta,
      },
      {
        userId: call.recipient,
        type: "private_call",
        amount: creatorNetShare,
        reason: `Minuto adicional en llamada privada de ${call.caller}`,
        status: "completed",
        metadata: txMeta,
      },
    ];
    if (agencyShare > 0 && parentCreatorId) {
      txDocs.push({
        userId: parentCreatorId,
        type: "agency_earned",
        amount: agencyShare,
        reason: `Comisión de agencia por minuto de llamada privada`,
        status: "completed",
        metadata: { ...txMeta, subCreatorId: String(call.recipient) },
      });
    }
    CoinTransaction.create(txDocs).catch((err) => console.error("[call tick tx] Failed to record tick transactions:", err));

    res.json({ ok: true, coinsDeducted: pricePerMinute, creatorEarned: creatorNetShare, agencyEarned: agencyShare });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  inviteCall,
  getIncoming,
  getCallById,
  respondCall,
  endCall,
  submitOffer,
  submitAnswer,
  addCandidates,
  getCandidates,
  tickCall,
};
