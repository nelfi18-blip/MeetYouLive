"use strict";

const VideoCall = require("../models/VideoCall.js");
const { getIO } = require("../lib/socket.js");
const { notifyMissedCall } = require("../services/essentialNotification.service.js");
const { DEFAULT_SOCIAL_CALL_SETTINGS } = require("../services/platformSettings.service.js");

const INTERVAL_MS = 10 * 1000;
const MIN_TIMEOUT_SECONDS = 10;
const MIN_DURATION_SECONDS = 60;
let intervalId = null;

const emitCallEvent = (call, event, payload = {}) => {
  const io = getIO();
  if (!io || !call) return;
  const callerId = String(call.caller || "");
  const recipientId = String(call.recipient || "");
  const data = {
    callId: String(call._id),
    status: call.status,
    type: call.type,
    ...payload,
  };
  if (callerId) io.to(callerId).emit(event, data);
  if (recipientId && recipientId !== callerId) io.to(recipientId).emit(event, data);
};

const secondsElapsed = (date, nowMs) => Math.floor((nowMs - new Date(date).getTime()) / 1000);

async function expirePendingSocialCalls(now = new Date()) {
  const nowMs = now.getTime();
  const candidates = await VideoCall.find({
    type: "social",
    status: "pending",
    createdAt: { $lte: new Date(nowMs - MIN_TIMEOUT_SECONDS * 1000) },
  }).select("_id caller recipient type status createdAt timeoutSeconds");

  let expired = 0;
  for (const call of candidates) {
    const timeoutSeconds = Math.max(
      MIN_TIMEOUT_SECONDS,
      Number(call.timeoutSeconds || DEFAULT_SOCIAL_CALL_SETTINGS.timeoutSeconds)
    );
    if (secondsElapsed(call.createdAt, nowMs) < timeoutSeconds) continue;
    const updated = await VideoCall.findOneAndUpdate(
      { _id: call._id, status: "pending", type: "social" },
      { $set: { status: "timeout", endedAt: now, endedReason: "timeout" } },
      { new: true }
    );
    if (!updated) continue;
    expired += 1;
    emitCallEvent(updated, "CALL_TIMEOUT", { reason: "timeout" });
    emitCallEvent(updated, "CALL_MISSED", { reason: "timeout" });
    notifyMissedCall({
      callId: updated._id,
      callerId: updated.caller,
      recipientId: updated.recipient,
    }).catch(() => {});
  }
  return expired;
}

async function expireAcceptedSocialCalls(now = new Date()) {
  const nowMs = now.getTime();
  const candidates = await VideoCall.find({
    type: "social",
    status: "accepted",
    startedAt: { $lte: new Date(nowMs - MIN_DURATION_SECONDS * 1000) },
  }).select("_id caller recipient type status startedAt maxDurationSeconds");

  let expired = 0;
  for (const call of candidates) {
    const maxDurationSeconds = Math.max(
      MIN_DURATION_SECONDS,
      Number(call.maxDurationSeconds || DEFAULT_SOCIAL_CALL_SETTINGS.maxDurationSeconds)
    );
    if (secondsElapsed(call.startedAt, nowMs) < maxDurationSeconds) continue;
    const totalDurationSeconds = secondsElapsed(call.startedAt, nowMs);
    const updated = await VideoCall.findOneAndUpdate(
      { _id: call._id, status: "accepted", type: "social" },
      {
        $set: {
          status: "ended",
          endedAt: now,
          endedReason: "max_duration",
          totalDurationSeconds,
        },
      },
      { new: true }
    );
    if (!updated) continue;
    expired += 1;
    emitCallEvent(updated, "CALL_ENDED", { reason: "max_duration" });
  }
  return expired;
}

async function runSocialCallExpiration() {
  const now = new Date();
  const [pendingExpired, acceptedExpired] = await Promise.all([
    expirePendingSocialCalls(now),
    expireAcceptedSocialCalls(now),
  ]);
  return { pendingExpired, acceptedExpired };
}

function startSocialCallExpirationJob() {
  if (intervalId) return intervalId;
  runSocialCallExpiration().catch((err) => {
    console.error("Social call expiration cleanup failed:", err);
  });
  intervalId = setInterval(() => {
    runSocialCallExpiration().catch((err) => {
      console.error("Social call expiration cleanup failed:", err);
    });
  }, INTERVAL_MS);
  return intervalId;
}

module.exports = {
  expirePendingSocialCalls,
  expireAcceptedSocialCalls,
  runSocialCallExpiration,
  startSocialCallExpirationJob,
};
