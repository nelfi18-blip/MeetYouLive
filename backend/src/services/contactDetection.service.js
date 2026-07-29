"use strict";

const MAX_ANALYZED_CHARS = 1000;

const COMMON_TLDS = [
  "com", "net", "org", "io", "co", "app", "dev", "me", "tv", "gg", "info", "biz",
  "es", "mx", "ar", "cl", "co", "br", "pt", "us", "uk", "ca", "de", "fr", "it",
];

const SOCIAL_PLATFORMS = [
  "whatsapp", "telegram", "instagram", "tiktok", "snapchat", "facebook",
  "messenger", "discord", "signal", "wechat",
];

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const tldPattern = COMMON_TLDS.map(escapeRegex).join("|");

const stripAccents = (value) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

function normalizeForDetection(value) {
  const limited = String(value || "").slice(0, MAX_ANALYZED_CHARS);
  return stripAccents(limited.normalize("NFKC"))
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactSeparators(value) {
  return value
    .replace(/\bwhats\s+app\b/g, "whatsapp")
    .replace(/\btele\s+gram\b/g, "telegram")
    .replace(/\btik\s+tok\b/g, "tiktok")
    .replace(/\bsnap\s+chat\b/g, "snapchat")
    .replace(/\bface\s+book\b/g, "facebook")
    .replace(/\bwe\s+chat\b/g, "wechat")
    .replace(/\bpunto\b/g, ".")
    .replace(/\bdot\b/g, ".")
    .replace(/\barroba\b/g, "@")
    .replace(/\bat\b/g, "@")
    .replace(/\s*([.@])\s*/g, "$1");
}

function hasPhone(text) {
  const candidates = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) || [];
  for (const candidate of candidates) {
    const digits = candidate.replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 15) return true;
    const hasPhoneContext = /\b(?:tel|telefono|telefono|cel|celular|movil|numero|llama|llamame|whatsapp)\b/.test(text);
    const hasSeparators = /[\s().-]/.test(candidate.trim());
    if (hasPhoneContext && hasSeparators && digits.length >= 8 && digits.length <= 15) return true;
  }
  return false;
}

function hasEmail(text) {
  if (/[a-z0-9._%+-]{1,64}\s*@\s*[a-z0-9.-]{1,253}\s*\.\s*[a-z]{2,24}\b/.test(text)) {
    return true;
  }
  return /[a-z0-9._%+-]{1,64}\s+@\s+[a-z0-9.-]{1,253}\s+\.\s+[a-z]{2,24}\b/.test(text);
}

function hasUrl(text) {
  if (/\b(?:https?|wss?):\/\/[^\s<>"']{2,200}/.test(text)) return true;
  if (/\bwww\.[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63}){0,4}\b/.test(text)) return true;
  const domainRegex = new RegExp(`(?<!@)\\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.(?:${tldPattern})\\b`);
  return domainRegex.test(text);
}

function hasSocialMedia(text) {
  const compact = compactSeparators(text);
  if (/\b(?:whatsapp|telegram|tiktok|snapchat|facebook|messenger|discord|signal|wechat)\b/.test(compact)) {
    return true;
  }
  if (/\b(?:instagram|insta)\b(?:\s*(?:es|:|=|usuario|user|perfil|cuenta|handle|@)\s*)?[a-z0-9_.@-]{3,30}\b/.test(compact)) {
    return true;
  }
  if (/\big\b\s*(?:es|:|=|usuario|user|perfil|cuenta|handle|@)\s*@?[a-z0-9_.-]{3,30}\b/.test(compact)) {
    return true;
  }
  if (/\b(?:line|snap)\b\s*(?:id|usuario|user|cuenta|contacto|es|:|=)\s*@?[a-z0-9_.-]{3,30}\b/.test(compact)) {
    return true;
  }
  return /\b(?:instagram|insta|ig|tiktok|telegram|snapchat|snap|facebook|messenger|discord|signal|wechat|line)\b.{0,24}@[a-z0-9_.-]{3,30}\b/.test(compact);
}

function detectContactTypes(input, options = {}) {
  const text = compactSeparators(normalizeForDetection(input));
  if (!text) return [];

  const detected = new Set();
  if (options.blockPhones !== false && hasPhone(text)) detected.add("phone");
  if (options.blockEmails !== false && hasEmail(text)) detected.add("email");
  if (options.blockUrls !== false && hasUrl(text)) detected.add("url");
  if (options.blockSocialMedia !== false && hasSocialMedia(text)) detected.add("social_media");
  return Array.from(detected);
}

module.exports = {
  MAX_ANALYZED_CHARS,
  normalizeForDetection,
  detectContactTypes,
  hasPhone,
  hasEmail,
  hasUrl,
  hasSocialMedia,
};
