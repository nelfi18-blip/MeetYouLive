"use strict";

const crypto = require("crypto");
const ChatProtectionAttempt = require("../models/ChatProtectionAttempt.js");
const { detectContactTypes, hasMoneyRequest, normalizeForDetection } = require("./contactDetection.service.js");
const { getPlatformSettings } = require("./platformSettings.service.js");
const { evaluateChatTrust, getOtherParticipantId } = require("./chatTrust.service.js");

const CONTACT_SHARING_RESTRICTED = "CONTACT_SHARING_RESTRICTED";
const CONTACT_SHARING_RESTRICTED_MESSAGE =
  "Por seguridad y para proteger la comunidad, todavía no puedes compartir información de contacto. Continúa interactuando en MeetYouLive para desbloquear esta función.";

const EXTERNAL_PAYMENT_RESTRICTED = "EXTERNAL_PAYMENT_RESTRICTED";
const EXTERNAL_PAYMENT_RESTRICTED_MESSAGE =
  "Por tu seguridad, no compartas información de contacto personal ni solicites pagos fuera de MeetYouLive.";

function getRequestSource(req) {
  const header = String(req?.headers?.["x-client-platform"] || req?.headers?.["x-platform"] || "").toLowerCase();
  const userAgent = String(req?.headers?.["user-agent"] || "").toLowerCase();
  if (header === "android" || /\bandroid\b/.test(userAgent)) return "android";
  if (header === "web" || /\bmozilla\b|\bchrome\b|\bsafari\b|\bfirefox\b/.test(userAgent)) return "web";
  return "unknown";
}

function hashContent({ text, chatId, senderId }) {
  return crypto
    .createHash("sha256")
    .update(`${String(chatId)}:${String(senderId)}:${String(text || "").slice(0, 1000)}`)
    .digest("hex");
}

async function logBlockedAttempt({ text, chat, chatId, senderId, recipientId, detectedTypes, code, trust, req }) {
  try {
    await ChatProtectionAttempt.create({
      senderId,
      recipientId,
      chatId,
      detectedTypes,
      source: getRequestSource(req),
      contentHash: hashContent({ text, chatId, senderId }),
      ruleApplied: {
        code,
        mode: trust?.mode,
        checks: trust?.checks,
        chatParticipantCount: Array.isArray(chat?.participants) ? chat.participants.length : undefined,
      },
    });
  } catch (err) {
    console.error("[chatProtection] failed to log blocked attempt:", err.message);
  }
}

// Live rooms are public broadcasts (host + many viewers), not a matched 1:1
// chat, so there is no `chat` document/participants list and no single
// `chatId` to log against. `recipientId` here always identifies the live's
// host, even when the host itself is the sender (self-referential log entry
// representing "attempt made inside this host's live room").
async function logBlockedLiveAttempt({ text, liveId, senderId, recipientId, detectedTypes, code, req }) {
  try {
    await ChatProtectionAttempt.create({
      senderId,
      recipientId,
      liveId,
      detectedTypes,
      source: getRequestSource(req),
      contentHash: hashContent({ text, chatId: liveId, senderId }),
      ruleApplied: { code, context: "live_message" },
    });
  } catch (err) {
    console.error("[chatProtection] failed to log blocked live attempt:", err.message);
  }
}

async function checkChatMessageProtection({ text, chat, chatId, senderId, req }) {
  const settings = await getPlatformSettings();
  const protectionSettings = settings.chatProtection || {};

  // Money/scam requests are never trust-bypassable: this is an anti-scam safeguard,
  // not the gradual "unlock contact sharing" feature, so it stays active even if
  // chatProtectionEnabled is turned off for regular contact-sharing detection.
  const normalized = normalizeForDetection(text);
  if (normalized && hasMoneyRequest(normalized)) {
    const recipientId = getOtherParticipantId(chat, senderId);
    if (recipientId) {
      await logBlockedAttempt({
        text,
        chat,
        chatId,
        senderId,
        recipientId,
        detectedTypes: ["money_request"],
        code: EXTERNAL_PAYMENT_RESTRICTED,
        req,
      });
    }
    return {
      allowed: false,
      status: 403,
      code: EXTERNAL_PAYMENT_RESTRICTED,
      message: EXTERNAL_PAYMENT_RESTRICTED_MESSAGE,
      detectedTypes: ["money_request"],
    };
  }

  if (protectionSettings.chatProtectionEnabled === false) {
    return { allowed: true, detectedTypes: [] };
  }

  const detectedTypes = detectContactTypes(text, protectionSettings);
  if (detectedTypes.length === 0) {
    return { allowed: true, detectedTypes: [] };
  }

  const trust = await evaluateChatTrust({
    chat,
    chatId,
    senderId,
    settings: protectionSettings,
  });
  if (trust.trusted) {
    return { allowed: true, detectedTypes, trusted: true };
  }

  const recipientId = trust.otherParticipantId || getOtherParticipantId(chat, senderId);
  if (recipientId) {
    await logBlockedAttempt({
      text,
      chat,
      chatId,
      senderId,
      recipientId,
      detectedTypes,
      code: CONTACT_SHARING_RESTRICTED,
      trust,
      req,
    });
  }

  return {
    allowed: false,
    status: 403,
    code: CONTACT_SHARING_RESTRICTED,
    message: CONTACT_SHARING_RESTRICTED_MESSAGE,
    detectedTypes,
  };
}

// Applies the same contact/payment detection rules used for private chat
// (`contactDetection.service.js` + the `chatProtection` platform settings)
// to Live room messages (host or viewer). Unlike private chat, a Live is a
// public broadcast with no 1:1 match, so there is no "trust" relationship to
// gradually unlock: every detected attempt is blocked while the category is
// enabled, consistent with the money-request check already being
// non-bypassable for private chat.
async function checkLiveMessageProtection({ text, liveId, hostUserId, senderId, req }) {
  const settings = await getPlatformSettings();
  const protectionSettings = settings.chatProtection || {};

  const normalized = normalizeForDetection(text);
  if (normalized && hasMoneyRequest(normalized)) {
    if (hostUserId) {
      await logBlockedLiveAttempt({
        text,
        liveId,
        senderId,
        recipientId: hostUserId,
        detectedTypes: ["money_request"],
        code: EXTERNAL_PAYMENT_RESTRICTED,
        req,
      });
    }
    return {
      allowed: false,
      status: 403,
      code: EXTERNAL_PAYMENT_RESTRICTED,
      message: EXTERNAL_PAYMENT_RESTRICTED_MESSAGE,
      detectedTypes: ["money_request"],
    };
  }

  if (protectionSettings.chatProtectionEnabled === false) {
    return { allowed: true, detectedTypes: [] };
  }

  const detectedTypes = detectContactTypes(text, protectionSettings);
  if (detectedTypes.length === 0) {
    return { allowed: true, detectedTypes: [] };
  }

  if (hostUserId) {
    await logBlockedLiveAttempt({
      text,
      liveId,
      senderId,
      recipientId: hostUserId,
      detectedTypes,
      code: CONTACT_SHARING_RESTRICTED,
      req,
    });
  }

  return {
    allowed: false,
    status: 403,
    code: CONTACT_SHARING_RESTRICTED,
    message: CONTACT_SHARING_RESTRICTED_MESSAGE,
    detectedTypes,
  };
}

module.exports = {
  CONTACT_SHARING_RESTRICTED,
  CONTACT_SHARING_RESTRICTED_MESSAGE,
  EXTERNAL_PAYMENT_RESTRICTED,
  EXTERNAL_PAYMENT_RESTRICTED_MESSAGE,
  getRequestSource,
  checkChatMessageProtection,
  checkLiveMessageProtection,
};
