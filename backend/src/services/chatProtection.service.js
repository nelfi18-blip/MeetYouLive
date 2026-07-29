"use strict";

const crypto = require("crypto");
const ChatProtectionAttempt = require("../models/ChatProtectionAttempt.js");
const { detectContactTypes } = require("./contactDetection.service.js");
const { getPlatformSettings } = require("./platformSettings.service.js");
const { evaluateChatTrust, getOtherParticipantId } = require("./chatTrust.service.js");

const CONTACT_SHARING_RESTRICTED = "CONTACT_SHARING_RESTRICTED";
const CONTACT_SHARING_RESTRICTED_MESSAGE =
  "Por seguridad y para proteger la comunidad, todavía no puedes compartir información de contacto. Continúa interactuando en MeetYouLive para desbloquear esta función.";

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

async function logBlockedAttempt({ text, chat, chatId, senderId, recipientId, detectedTypes, trust, req }) {
  try {
    await ChatProtectionAttempt.create({
      senderId,
      recipientId,
      chatId,
      detectedTypes,
      source: getRequestSource(req),
      contentHash: hashContent({ text, chatId, senderId }),
      ruleApplied: {
        code: CONTACT_SHARING_RESTRICTED,
        mode: trust.mode,
        checks: trust.checks,
        chatParticipantCount: Array.isArray(chat?.participants) ? chat.participants.length : undefined,
      },
    });
  } catch (err) {
    console.error("[chatProtection] failed to log blocked attempt:", err.message);
  }
}

async function checkChatMessageProtection({ text, chat, chatId, senderId, req }) {
  const settings = await getPlatformSettings();
  const protectionSettings = settings.chatProtection || {};
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

module.exports = {
  CONTACT_SHARING_RESTRICTED,
  CONTACT_SHARING_RESTRICTED_MESSAGE,
  getRequestSource,
  checkChatMessageProtection,
};
