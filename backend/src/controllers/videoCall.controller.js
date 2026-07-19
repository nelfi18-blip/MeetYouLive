const VideoCall = require("../models/VideoCall.js");
const mongoose = require("mongoose");
const User = require("../models/User.js");
const CoinTransaction = require("../models/CoinTransaction.js");
const AgencyRelationship = require("../models/AgencyRelationship.js");
const { calculateSplit } = require("../services/agency.service.js");
const {
  CALL_TYPES,
  normalizeCallType,
  assertSocialCallAllowed,
  assertPaidCreatorCallAllowed,
  assertNotBlockedBetween,
  isPendingCallExpired,
  PENDING_CALL_TIMEOUT_MS,
} = require("../services/callRules.service.js");
const { getIO, getOnlineUsers } = require("../lib/socket.js");
const { withSerializedUserPhotoFields } = require("../lib/photoFields.js");

const CALL_USER_FIELDS = "username name avatar profilePhotos profileImage photo role lastActiveAt";

const MEDIA_TYPES = Object.freeze({
  AUDIO: "audio",
  VIDEO: "video",
});

const normalizeMediaType = (mediaType) =>
  mediaType === MEDIA_TYPES.AUDIO ? MEDIA_TYPES.AUDIO : MEDIA_TYPES.VIDEO;

const isUserOnline = (userId) =>
  getOnlineUsers().some((onlineUser) => String(onlineUser.userId) === String(userId));

const getOnlineUserIdSet = () =>
  new Set(getOnlineUsers().map((onlineUser) => String(onlineUser.userId)));

const isBetweenUsers = (call, userA, userB) => {
  const ids = new Set([String(userA), String(userB)]);
  return ids.has(String(call.caller)) && ids.has(String(call.recipient));
};

const findBlockingCall = async (callerId, recipientId) => {
  const activeCalls = await VideoCall.find({
    status: { $in: ["pending", "accepted"] },
    $or: [
      { caller: callerId },
      { recipient: callerId },
      { caller: recipientId },
      { recipient: recipientId },
    ],
  }).sort({ createdAt: -1 });

  for (const activeCall of activeCalls) {
    if (isPendingCallExpired(activeCall)) {
      await markPendingCallMissed(activeCall);
      continue;
    }

    if (activeCall.status === "pending" && isBetweenUsers(activeCall, callerId, recipientId)) {
      continue;
    }

    return activeCall;
  }

  return null;
};

// Helper: refund coins to caller for a paid call. Accepts a raw id or populated user.
const refundPaidCall = async (callerId, coins) => {
  if (coins > 0) {
    await User.findByIdAndUpdate(callerId?._id || callerId, { $inc: { coins } });
  }
};

const emitCallEvent = (call, event, payload = {}) => {
  const io = getIO();
  if (!io || !call) return;
  const callerId = String(call.caller?._id || call.caller || "");
  const recipientId = String(call.recipient?._id || call.recipient || "");
  const data = {
    callId: String(call._id),
    status: call.status,
    type: call.type,
    ...payload,
  };
  if (callerId) io.to(callerId).emit(event, data);
  if (recipientId && recipientId !== callerId) io.to(recipientId).emit(event, data);
};

const markPendingCallMissed = async (call) => {
  if (!call || call.status !== "pending") return call;
  if (call.type === CALL_TYPES.PAID_CREATOR) {
    await refundPaidCall(call.caller, call.callCoins);
  }
  call.status = "missed";
  call.endedAt = new Date();
  await call.save();
  emitCallEvent(call, "CALL_MISSED");
  return call;
};

const getHistoryStatus = (call) => {
  if (call.status === "ended" && !call.startedAt) return "cancelled";
  if (call.status === "ended" || call.status === "accepted") return "answered";
  return call.status;
};

const serializeCallHistoryItem = (req, call, onlineUserIds) => {
  const payload = typeof call.toObject === "function" ? call.toObject() : call;
  const currentUserId = String(req.userId);
  const callerId = String(payload.caller?._id || payload.caller || "");
  const recipientId = String(payload.recipient?._id || payload.recipient || "");
  const direction = callerId === currentUserId ? "outgoing" : "incoming";
  const peer = direction === "outgoing" ? payload.recipient : payload.caller;
  const peerId = String(peer?._id || "");
  const startedAt = payload.startedAt ? new Date(payload.startedAt) : null;
  const endedAt = payload.endedAt ? new Date(payload.endedAt) : null;
  // Prefer the persisted duration from completed calls; calculate a fallback for legacy/in-flight records.
  const finalDurationSeconds =
    payload.totalDurationSeconds != null
      ? payload.totalDurationSeconds
      : (startedAt && endedAt ? Math.max(0, Math.floor((endedAt - startedAt) / 1000)) : 0);

  return {
    _id: payload._id,
    direction,
    status: getHistoryStatus(payload),
    rawStatus: payload.status,
    type: payload.type,
    mediaType: payload.mediaType || MEDIA_TYPES.VIDEO,
    createdAt: payload.createdAt,
    startedAt: payload.startedAt,
    endedAt: payload.endedAt,
    durationSeconds: finalDurationSeconds,
    peer: peer ? withSerializedUserPhotoFields(req, peer) : null,
    isPeerOnline: peerId ? onlineUserIds.has(peerId) : false,
  };
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

  const callType = normalizeCallType(type);
  const mediaType = normalizeMediaType(req.body?.mediaType);
  let coins = callType === CALL_TYPES.PAID_CREATOR ? Math.max(0, parseInt(callCoins) || 0) : 0;
  let creatorPricePerMinute = 0;

  try {
    await assertNotBlockedBetween(req.userId, recipientId);

    // For social calls: require mutual match
    if (callType === CALL_TYPES.SOCIAL) {
      await assertSocialCallAllowed(req.userId, recipientId);
      if (!isUserOnline(recipientId)) {
        return res.status(409).json({
          code: "USER_OFFLINE",
          message: "The user is offline. Please try again when they are online.",
        });
      }
    }

    const blockingCall = await findBlockingCall(req.userId, recipientId);
    if (blockingCall) {
      return res.status(409).json({
        code: "CALL_BUSY",
        message: "The user is in another call. Please try again later.",
      });
    }

    // For paid creator calls: recipient must be a creator with private calls enabled
    if (callType === CALL_TYPES.PAID_CREATOR) {
      // Enforce callCoins = pricePerMinute (caller cannot set an arbitrary amount)
      const { pricePerMinute } = await assertPaidCreatorCallAllowed(recipientId);
      creatorPricePerMinute = pricePerMinute;
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
      if (pending.type === CALL_TYPES.PAID_CREATOR) {
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
      mediaType,
      callCoins: coins,
      pricePerMinute: creatorPricePerMinute,
    });

    const populated = await VideoCall.findById(call._id)
      .populate("caller", "username name avatar")
      .populate("recipient", "username name avatar");

    // Notify the recipient in real time
    const io = getIO();
    if (io) {
      const callerName = populated.caller?.username || populated.caller?.name || "";
      io.to(String(recipientId)).emit("CALL_INCOMING", {
        callId: String(call._id),
        callerId: String(req.userId),
        callerName,
        type: call.type,
        mediaType: call.mediaType,
        callCoins: call.callCoins,
      });
    }

    res.status(201).json(populated);
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

// GET /api/calls/incoming — pending calls for current user
const getIncoming = async (req, res) => {
  try {
    const stalePending = await VideoCall.findOne({
      recipient: req.userId,
      status: "pending",
      createdAt: { $lte: new Date(Date.now() - PENDING_CALL_TIMEOUT_MS) },
    }).sort({ createdAt: 1 });
    if (stalePending) await markPendingCallMissed(stalePending);

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

// GET /api/calls/history — call history for current user
const getCallHistory = async (req, res) => {
  try {
    const stalePendingCalls = await VideoCall.find({
      status: "pending",
      createdAt: { $lte: new Date(Date.now() - PENDING_CALL_TIMEOUT_MS) },
      $or: [{ caller: req.userId }, { recipient: req.userId }],
    });
    await Promise.all(stalePendingCalls.map((staleCall) => markPendingCallMissed(staleCall)));

    const parsedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isNaN(parsedLimit) ? 50 : Math.min(Math.max(parsedLimit, 1), 100);
    const calls = await VideoCall.find({
      $or: [{ caller: req.userId }, { recipient: req.userId }],
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("caller", CALL_USER_FIELDS)
      .populate("recipient", CALL_USER_FIELDS);

    const onlineUserIds = getOnlineUserIdSet();
    res.json({
      calls: calls.map((call) => serializeCallHistoryItem(req, call, onlineUserIds)),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/calls/:id — get call details
const getCallById = async (req, res) => {
  try {
    let call = await VideoCall.findById(req.params.id)
      .populate("caller", "username name avatar")
      .populate("recipient", "username name avatar");

    if (!call) return res.status(404).json({ message: "Llamada no encontrada" });

    if (isPendingCallExpired(call)) {
      call = await markPendingCallMissed(call);
    }

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

    if (isPendingCallExpired(call)) {
      await markPendingCallMissed(call);
      return res.status(410).json({ message: "La llamada expiró" });
    }

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

      // Credit creator for paid calls — platform takes 40% first, remaining 60% split
      if (call.type === CALL_TYPES.PAID_CREATOR && call.callCoins > 0) {
        // Look up the canonical AgencyRelationship for the percentage at this moment.
        // Commission only applies when the sub-creator has explicitly accepted (subCreatorAgreed: true),
        // matching the same safety rule enforced in gift.controller.js.
        const agencyRel = await AgencyRelationship.findOne({ subCreator: call.recipient, status: "active", subCreatorAgreed: true });
        const agencyPercentage = (agencyRel && agencyRel.percentage > 0) ? agencyRel.percentage : null;
        
        // Use calculateSplit to ensure platform always gets exactly 40%
        const split = calculateSplit(call.callCoins, agencyPercentage);
        const { platformShare, creatorNetShare, agencyShare } = split;
        const referrerId = agencyPercentage ? agencyRel.parentCreator : null;
        const agencyPercentageApplied = agencyPercentage || 0;

        await User.findByIdAndUpdate(call.recipient, {
          $inc: { earningsCoins: creatorNetShare },
        });

        if (agencyShare > 0 && referrerId) {
          await User.findByIdAndUpdate(referrerId, {
            $inc: { agencyEarningsCoins: agencyShare, totalAgencyGeneratedCoins: call.callCoins },
          });
        }

        // Track billing totals on the call document
        call.totalCoinsCharged = (call.totalCoinsCharged || 0) + call.callCoins;
        call.creatorShare = (call.creatorShare || 0) + creatorNetShare;
        call.platformShare = (call.platformShare || 0) + platformShare;
        call.agencyShare = (call.agencyShare || 0) + agencyShare;
        if (referrerId && !call.referrerId) {
          call.referrerId = referrerId;
        }
        if (agencyPercentageApplied > 0 && !call.agencyPercentageApplied) {
          call.agencyPercentageApplied = agencyPercentageApplied;
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
        if (agencyShare > 0 && referrerId) {
          txDocs.push({
            userId: referrerId,
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
      if (call.type === CALL_TYPES.PAID_CREATOR) {
        await refundPaidCall(call.caller, call.callCoins);
      }
    }

    await call.save();

    const populated = await VideoCall.findById(call._id)
      .populate("caller", "username name avatar")
      .populate("recipient", "username name avatar");

    emitCallEvent(populated, action === "accept" ? "CALL_ACCEPTED" : "CALL_REJECTED");
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
      return res.status(409).json({ message: "La llamada ya está finalizada" });
    }

    // Refund coins if paid call ended before fully accepted (caller hangs up while pending)
    if (call.status === "pending" && call.type === CALL_TYPES.PAID_CREATOR) {
      await refundPaidCall(call.caller, call.callCoins);
    }

    call.status = "ended";
    call.endedAt = new Date();
    if (call.startedAt) {
      call.totalDurationSeconds = Math.floor((call.endedAt - call.startedAt) / 1000);
    }
    await call.save();

    emitCallEvent(call, "CALL_ENDED", { reason: req.body?.reason || "hangup" });
    res.json(call);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// LEGACY/INACTIVE: WebRTC SDP signaling is retained for old clients only.
// Active call rooms use Agora tokens with the VideoCall _id as channelName.
// PUT /api/calls/:id/offer — caller submits legacy WebRTC SDP offer
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

// LEGACY/INACTIVE: WebRTC SDP signaling is retained for old clients only.
// PUT /api/calls/:id/answer — callee submits legacy WebRTC SDP answer
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

// LEGACY/INACTIVE: WebRTC ICE candidate storage is retained for old clients only.
// POST /api/calls/:id/candidates — submit legacy ICE candidates
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

// LEGACY/INACTIVE: WebRTC ICE candidate storage is retained for old clients only.
// GET /api/calls/:id/candidates — get legacy ICE candidates from the remote peer
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
  let dbSession;
  try {
    dbSession = await mongoose.startSession();
    const call = await VideoCall.findById(req.params.id);
    if (!call) return res.status(404).json({ message: "Llamada no encontrada" });

    if (String(call.caller) !== String(req.userId)) {
      return res.status(403).json({ message: "Solo el llamante puede activar el tick de facturación" });
    }

    if (call.status !== "accepted") {
      return res.status(400).json({ message: "La llamada no está activa" });
    }

    if (call.type !== CALL_TYPES.PAID_CREATOR || call.callCoins <= 0) {
      return res.status(400).json({ message: "Esta llamada no es de pago" });
    }

    const pricePerMinute = call.callCoins;

    // Look up the canonical AgencyRelationship for the percentage at this moment.
    // Commission only applies when the sub-creator has explicitly accepted (subCreatorAgreed: true),
    // matching the same safety rule enforced in gift.controller.js.
    const agencyRel = await AgencyRelationship.findOne({ subCreator: call.recipient, status: "active", subCreatorAgreed: true });
    const agencyPercentage = (agencyRel && agencyRel.percentage > 0) ? agencyRel.percentage : null;
    
    // Use calculateSplit to ensure platform always gets exactly 40%
    const split = calculateSplit(pricePerMinute, agencyPercentage);
    const { platformShare, creatorNetShare, agencyShare } = split;
    const referrerId = agencyPercentage ? agencyRel.parentCreator : null;
    const agencyPercentageApplied = agencyPercentage || 0;

    const now = new Date();
    // Allow a small tolerance below 60s so legitimate client ticks are not
    // rejected due to timer drift or network latency, while duplicate retries
    // in the same minute remain idempotent.
    const minBillingIntervalAt = new Date(now.getTime() - 55 * 1000);
    let endedForInsufficientCoins = false;
    let duplicateTick = false;
    let endedCallForEvent = null;

    await dbSession.withTransaction(async () => {
      const claimedCall = await VideoCall.findOneAndUpdate(
        {
          _id: req.params.id,
          status: "accepted",
          type: CALL_TYPES.PAID_CREATOR,
          $or: [{ lastBilledAt: null }, { lastBilledAt: { $lte: minBillingIntervalAt } }],
        },
        { $set: { lastBilledAt: now } },
        { new: true, session: dbSession }
      );

      if (!claimedCall) {
        duplicateTick = true;
        return;
      }

      const updatedCaller = await User.findOneAndUpdate(
        { _id: claimedCall.caller, coins: { $gte: pricePerMinute } },
        { $inc: { coins: -pricePerMinute } },
        { new: true, session: dbSession }
      );

      if (!updatedCaller) {
        claimedCall.status = "ended";
        claimedCall.endedAt = now;
        if (claimedCall.startedAt) {
          claimedCall.totalDurationSeconds = Math.floor((claimedCall.endedAt - claimedCall.startedAt) / 1000);
        }
        await claimedCall.save({ session: dbSession });
        endedCallForEvent = claimedCall;
        endedForInsufficientCoins = true;
        return;
      }

      await User.findByIdAndUpdate(claimedCall.recipient, { $inc: { earningsCoins: creatorNetShare } }, { session: dbSession });

      if (agencyShare > 0 && referrerId) {
        await User.findByIdAndUpdate(referrerId, {
          $inc: { agencyEarningsCoins: agencyShare, totalAgencyGeneratedCoins: pricePerMinute },
        }, { session: dbSession });
      }

      const tickUpdate = {
        $inc: {
          totalCoinsCharged: pricePerMinute,
          creatorShare: creatorNetShare,
          platformShare,
          agencyShare,
        },
      };
      if (referrerId && !claimedCall.referrerId) {
        tickUpdate.$set = { referrerId, agencyPercentageApplied };
      }
      await VideoCall.findByIdAndUpdate(claimedCall._id, tickUpdate, { session: dbSession });

      const txMeta = { callId: String(claimedCall._id), billedAt: now.toISOString() };
      const txDocs = [
        {
          userId: claimedCall.caller,
          type: "private_call",
          amount: -pricePerMinute,
          reason: `Minuto adicional en llamada privada con ${claimedCall.recipient}`,
          status: "completed",
          metadata: txMeta,
        },
        {
          userId: claimedCall.recipient,
          type: "private_call",
          amount: creatorNetShare,
          reason: `Minuto adicional en llamada privada de ${claimedCall.caller}`,
          status: "completed",
          metadata: txMeta,
        },
      ];
      if (agencyShare > 0 && referrerId) {
        txDocs.push({
          userId: referrerId,
          type: "agency_earned",
          amount: agencyShare,
          reason: `Comisión de agencia por minuto de llamada privada`,
          status: "completed",
          metadata: { ...txMeta, subCreatorId: String(claimedCall.recipient) },
        });
      }
      await CoinTransaction.create(txDocs, { session: dbSession });
    });

    if (duplicateTick) {
      return res.json({ ok: true, billed: false });
    }

    if (endedForInsufficientCoins) {
      emitCallEvent(endedCallForEvent || call, "CALL_ENDED", { reason: "insufficient_coins" });
      return res.status(402).json({ message: "Monedas insuficientes. La llamada ha sido finalizada.", ended: true });
    }

    res.json({ ok: true, coinsDeducted: pricePerMinute, creatorEarned: creatorNetShare, agencyEarned: agencyShare });
  } catch (err) {
    res.status(500).json({ message: err.message });
  } finally {
    if (dbSession) {
      await dbSession.endSession();
    }
  }
};

module.exports = {
  inviteCall,
  getIncoming,
  getCallHistory,
  getCallById,
  respondCall,
  endCall,
  submitOffer,
  submitAnswer,
  addCandidates,
  getCandidates,
  tickCall,
};
