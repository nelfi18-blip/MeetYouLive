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
const BILLING_TICK_MIN_INTERVAL_MS = 55 * 1000;
const INSUFFICIENT_CALL_COINS = "INSUFFICIENT_CALL_COINS";

const MEDIA_TYPES = Object.freeze({
  AUDIO: "audio",
  VIDEO: "video",
});

const PENDING_FINAL_STATUSES = Object.freeze({
  MISSED: "missed",
  REJECTED: "rejected",
  ENDED: "ended",
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

const getCallId = (call) => String(call?._id || call || "");

const getPaidCallSplit = async (recipientId, coins, session) => {
  const agencyRel = await AgencyRelationship.findOne({
    subCreator: recipientId,
    status: "active",
    subCreatorAgreed: true,
  }).session(session);
  const agencyPercentage = (agencyRel && agencyRel.percentage > 0) ? agencyRel.percentage : null;
  const split = calculateSplit(coins, agencyPercentage);
  return {
    ...split,
    referrerId: agencyPercentage ? agencyRel.parentCreator : null,
    agencyPercentageApplied: agencyPercentage || 0,
  };
};

const buildInitialBillingTransactions = (call, split, now) => {
  const callId = getCallId(call);
  const txDocs = [
    {
      userId: call.caller,
      type: "private_call",
      amount: -call.callCoins,
      reason: `Llamada privada con creador ${call.recipient} (primer minuto)`,
      status: "completed",
      metadata: {
        callId,
        recipientId: String(call.recipient),
        billedAt: now.toISOString(),
        idempotencyKey: `${callId}:initial:caller`,
      },
    },
    {
      userId: call.recipient,
      type: "private_call",
      amount: split.creatorNetShare,
      reason: `Llamada privada aceptada de ${call.caller}`,
      status: "completed",
      metadata: {
        callId,
        callerUserId: String(call.caller),
        billedAt: now.toISOString(),
        idempotencyKey: `${callId}:initial:creator`,
      },
    },
  ];

  if (split.agencyShare > 0 && split.referrerId) {
    txDocs.push({
      userId: split.referrerId,
      type: "agency_earned",
      amount: split.agencyShare,
      reason: `Comisión de agencia por llamada privada`,
      status: "completed",
      metadata: {
        callId,
        subCreatorId: String(call.recipient),
        billedAt: now.toISOString(),
        idempotencyKey: `${callId}:initial:agency`,
      },
    });
  }

  return txDocs;
};

const shouldRefundInitialCharge = (call) =>
  // New calls are charged only on accept, so pending calls usually have no
  // debit to refund. This guard is for any pending call that already has a
  // recorded first-minute debit and has not been credited or refunded yet.
  call?.type === CALL_TYPES.PAID_CREATOR &&
  call.callCoins > 0 &&
  call.initialChargeDebitedAt &&
  !call.initialChargeCreditedAt &&
  !call.refundedAt;

const createRefundTransaction = (call, now, session) =>
  CoinTransaction.create([
    {
      userId: call.caller,
      type: "refund",
      amount: call.callCoins,
      reason: `Reembolso de llamada privada no aceptada con ${call.recipient}`,
      status: "completed",
      metadata: {
        callId: getCallId(call),
        recipientId: String(call.recipient),
        refundedAt: now.toISOString(),
        idempotencyKey: `${getCallId(call)}:pending-refund`,
      },
    },
  ], { session });

const finalizePendingCall = async (callOrId, finalStatus, eventName) => {
  const callId = getCallId(callOrId);
  if (!callId || !Object.values(PENDING_FINAL_STATUSES).includes(finalStatus)) return callOrId;

  const dbSession = await mongoose.startSession();
  let claimedCall = null;
  let currentCall = null;
  const now = new Date();

  try {
    await dbSession.withTransaction(async () => {
      claimedCall = await VideoCall.findOneAndUpdate(
        { _id: callId, status: "pending" },
        { $set: { status: finalStatus, endedAt: now } },
        { new: true, session: dbSession }
      );

      if (!claimedCall) {
        currentCall = await VideoCall.findById(callId).session(dbSession);
        return;
      }

      if (shouldRefundInitialCharge(claimedCall)) {
        await User.findByIdAndUpdate(
          claimedCall.caller,
          { $inc: { coins: claimedCall.callCoins } },
          { session: dbSession }
        );
        claimedCall.refundedAt = now;
        await claimedCall.save({ session: dbSession });
        await createRefundTransaction(claimedCall, now, dbSession);
      }
    });
  } finally {
    await dbSession.endSession();
  }

  const call = claimedCall || currentCall || callOrId;
  if (claimedCall) emitCallEvent(call, eventName);
  return call;
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
  return finalizePendingCall(call, PENDING_FINAL_STATUSES.MISSED, "CALL_MISSED");
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
      // Check affordability before creating the invite; the first minute is
      // charged atomically when the creator accepts.
      const hasEnoughCoins = await User.exists(
        { _id: req.userId, coins: { $gte: coins } },
      );
      if (!hasEnoughCoins) {
        return res.status(402).json({ message: `Necesitas ${coins} monedas para esta llamada` });
      }
    }

    // Cancel any existing pending calls between these users; refund coins for paid ones
    const pendingCalls = await VideoCall.find({
      $or: [
        { caller: req.userId, recipient: recipientId, status: "pending" },
        { caller: recipientId, recipient: req.userId, status: "pending" },
      ],
    });

    await Promise.all(
      pendingCalls.map((pending) =>
        finalizePendingCall(pending, PENDING_FINAL_STATUSES.MISSED, "CALL_MISSED")
      )
    );

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

  let dbSession;
  let eventName = null;
  let eventCall = null;

  try {
    const initialCall = await VideoCall.findById(req.params.id);
    const call = initialCall;
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

    if (action === "reject") {
      eventCall = await finalizePendingCall(call, PENDING_FINAL_STATUSES.REJECTED, "CALL_REJECTED");
      const populatedRejected = await VideoCall.findById(call._id)
        .populate("caller", "username name avatar")
        .populate("recipient", "username name avatar");
      return res.json(populatedRejected || eventCall);
    }

    dbSession = await mongoose.startSession();
    const now = new Date();
    let acceptedCall = null;
    let responseStatus = 200;
    let responseBody = null;

    await dbSession.withTransaction(async () => {
      const pendingCall = await VideoCall.findById(req.params.id).session(dbSession);
      if (!pendingCall) {
        responseStatus = 404;
        responseBody = { message: "Llamada no encontrada" };
        return;
      }
      if (String(pendingCall.recipient) !== String(req.userId)) {
        responseStatus = 403;
        responseBody = { message: "Solo el destinatario puede responder" };
        return;
      }
      if (pendingCall.status !== "pending") {
        responseStatus = 400;
        responseBody = { message: "Esta llamada ya fue respondida" };
        return;
      }

      const update = {
        $set: {
          status: "accepted",
          startedAt: pendingCall.startedAt || now,
        },
      };

      let split = null;
      if (pendingCall.type === CALL_TYPES.PAID_CREATOR && pendingCall.callCoins > 0) {
        split = await getPaidCallSplit(pendingCall.recipient, pendingCall.callCoins, dbSession);
        update.$set.initialChargeDebitedAt = now;
        update.$set.initialChargeCreditedAt = now;
        update.$inc = {
          totalCoinsCharged: pendingCall.callCoins,
          creatorShare: split.creatorNetShare,
          platformShare: split.platformShare,
          agencyShare: split.agencyShare,
        };
        if (split.referrerId && !pendingCall.referrerId) {
          update.$set.referrerId = split.referrerId;
        }
        if (split.agencyPercentageApplied > 0 && !pendingCall.agencyPercentageApplied) {
          update.$set.agencyPercentageApplied = split.agencyPercentageApplied;
        }
      }

      // status:"pending" is the authoritative concurrency claim; the billing
      // marker is an extra idempotency guard for first-minute crediting.
      acceptedCall = await VideoCall.findOneAndUpdate(
        { _id: pendingCall._id, status: "pending", initialChargeCreditedAt: null },
        update,
        { new: true, session: dbSession }
      );

      if (!acceptedCall) {
        responseStatus = 400;
        responseBody = { message: "Esta llamada ya fue respondida" };
        return;
      }

      if (split) {
        const updatedCaller = await User.findOneAndUpdate(
          { _id: acceptedCall.caller, coins: { $gte: acceptedCall.callCoins } },
          { $inc: { coins: -acceptedCall.callCoins } },
          { new: true, session: dbSession }
        );
        if (!updatedCaller) {
          const err = new Error(INSUFFICIENT_CALL_COINS);
          err.statusCode = 402;
          err.callCoins = acceptedCall.callCoins;
          throw err;
        }

        await User.findByIdAndUpdate(
          acceptedCall.recipient,
          { $inc: { earningsCoins: split.creatorNetShare } },
          { session: dbSession }
        );

        if (split.agencyShare > 0 && split.referrerId) {
          await User.findByIdAndUpdate(split.referrerId, {
            $inc: { agencyEarningsCoins: split.agencyShare, totalAgencyGeneratedCoins: acceptedCall.callCoins },
          }, { session: dbSession });
        }

        await CoinTransaction.create(
          buildInitialBillingTransactions(acceptedCall, split, now),
          { session: dbSession }
        );
      }
    });

    if (responseBody) {
      return res.status(responseStatus).json(responseBody);
    }

    const populated = await VideoCall.findById(acceptedCall._id)
      .populate("caller", "username name avatar")
      .populate("recipient", "username name avatar");

    eventName = "CALL_ACCEPTED";
    eventCall = populated;
    emitCallEvent(eventCall, eventName);
    res.json(populated);
  } catch (err) {
    if (err.message === INSUFFICIENT_CALL_COINS) {
      return res.status(err.statusCode).json({ message: `Necesitas ${err.callCoins} monedas para esta llamada` });
    }
    res.status(500).json({ message: err.message });
  } finally {
    if (dbSession) {
      await dbSession.endSession();
    }
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

    if (call.status === "pending") {
      const endedPending = await finalizePendingCall(call, PENDING_FINAL_STATUSES.ENDED, "CALL_ENDED");
      return res.json(endedPending);
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
    const now = new Date();
    // Allow a small tolerance below 60s so legitimate client ticks are not
    // rejected due to timer drift or network latency, while duplicate retries
    // in the same minute remain idempotent.
    const minBillingIntervalAt = new Date(now.getTime() - BILLING_TICK_MIN_INTERVAL_MS);
    let responseStatus = 200;
    let responseBody = null;
    let endedCallForEvent = null;

    await dbSession.withTransaction(async () => {
      const call = await VideoCall.findById(req.params.id).session(dbSession);
      if (!call) {
        responseStatus = 404;
        responseBody = { message: "Llamada no encontrada" };
        return;
      }

      if (String(call.caller) !== String(req.userId)) {
        responseStatus = 403;
        responseBody = { message: "Solo el llamante puede activar el tick de facturación" };
        return;
      }

      if (call.status !== "accepted") {
        responseStatus = 400;
        responseBody = { message: "La llamada no está activa" };
        return;
      }

      if (call.type !== CALL_TYPES.PAID_CREATOR || call.callCoins <= 0) {
        responseStatus = 400;
        responseBody = { message: "Esta llamada no es de pago" };
        return;
      }

      const pricePerMinute = call.callCoins;
      const agencyRel = await AgencyRelationship.findOne({
        subCreator: call.recipient,
        status: "active",
        subCreatorAgreed: true,
      }).session(dbSession);
      const agencyPercentage = (agencyRel && agencyRel.percentage > 0) ? agencyRel.percentage : null;
      const { platformShare, creatorNetShare, agencyShare } = calculateSplit(pricePerMinute, agencyPercentage);
      const referrerId = agencyPercentage ? agencyRel.parentCreator : null;
      const agencyPercentageApplied = agencyPercentage || 0;

      const claimedCall = await VideoCall.findOneAndUpdate(
        {
          _id: call._id,
          status: "accepted",
          type: CALL_TYPES.PAID_CREATOR,
          $or: [{ lastBilledAt: null }, { lastBilledAt: { $lte: minBillingIntervalAt } }],
        },
        { $set: { lastBilledAt: now } },
        { new: true, session: dbSession }
      );

      if (!claimedCall) {
        responseBody = { ok: true, billed: false };
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
        responseStatus = 402;
        responseBody = { message: "Monedas insuficientes. La llamada ha sido finalizada.", ended: true };
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
      responseBody = { ok: true, coinsDeducted: pricePerMinute, creatorEarned: creatorNetShare, agencyEarned: agencyShare };
    });

    if (endedCallForEvent) {
      emitCallEvent(endedCallForEvent, "CALL_ENDED", { reason: "insufficient_coins" });
    }

    if (responseStatus === 200) return res.json(responseBody);
    return res.status(responseStatus).json(responseBody);
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
