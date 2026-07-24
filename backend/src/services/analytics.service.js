const AnalyticsEvent = require("../models/AnalyticsEvent.js");

const PUBLIC_ANALYTICS_EVENTS = new Set([
  "landing_view",
  "register_cta_click",
  "login_cta_click",
  "google_login_click",
  "registration_started",
  "registration_submitted",
  "registration_failed",
  "email_verification_view",
  "email_verified",
  "onboarding_started",
  "onboarding_step_completed",
  "onboarding_completed",
  "feed_reached",
]);

const AUTHENTICATED_ANALYTICS_EVENTS = new Set([
  "login_completed",
  "profile_completed",
  "first_like",
  "first_match",
  "first_message",
  "first_live_join",
  "first_live_started",
  "coins_checkout_started",
  "coins_purchase_completed",
]);

const LEGACY_ANALYTICS_EVENTS = new Set([
  "gift_sent",
  "coins_purchased",
  "vip_subscribed",
  "vip_canceled",
  "live_joined",
  "live_duration",
  "referral_shared",
  "referral_converted",
]);

const ALLOWED_ANALYTICS_EVENTS = new Set([
  ...PUBLIC_ANALYTICS_EVENTS,
  ...AUTHENTICATED_ANALYTICS_EVENTS,
  ...LEGACY_ANALYTICS_EVENTS,
]);

const ALLOWED_METADATA_KEYS = new Set([
  "step",
  "packageId",
  "coins",
  "amountUsd",
  "internalReference",
  "reason",
]);

const SENSITIVE_KEY_PATTERN = /(email|mail|phone|tel|password|pass|token|secret|card|iban|cvv|message|text|name|username|address|ip)/i;
const SENSITIVE_PARAM_PATTERN = /^(token|code|secret|password|pass|email|phone|tel|session|jwt|state)$/i;
const VISITOR_ID_PATTERN = /^[a-zA-Z0-9_-]{12,80}$/;
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{12,80}$/;
const DEDUPE_KEY_PATTERN = /^[a-zA-Z0-9:_-]{8,180}$/;
const DEVICE_CATEGORIES = new Set(["mobile", "tablet", "desktop", "unknown"]);
const SOURCES = new Set(["instagram", "facebook", "tiktok", "whatsapp", "google", "direct", "other"]);
const DETAIL_RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PATH_LENGTH = 240;
const SAFE_UTM_KEYS = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_content"]);
const SPOOFING_UNICODE_PATTERN = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g;
const KNOWN_BOT_PATTERNS = [
  "bot",
  "crawler",
  "spider",
  "slurp",
  "facebookexternalhit",
  "preview",
  "headless",
  "uptime",
  "pingdom",
  "render",
  "vercel",
  "healthcheck",
];
const KNOWN_BOT_REGEX = new RegExp(KNOWN_BOT_PATTERNS.join("|"), "i");
const ONCE_PER_USER_EVENTS = new Set([
  "profile_completed",
  "first_like",
  "first_match",
  "first_message",
  "first_live_join",
  "first_live_started",
]);

const cleanString = (value, maxLength = 120) => {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .trim()
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(SPOOFING_UNICODE_PATTERN, "")
    .slice(0, maxLength);
};

const sanitizePath = (value) => {
  const raw = cleanString(value, MAX_PATH_LENGTH);
  if (!raw || !raw.startsWith("/")) return "/";
  const [pathname, query = ""] = raw.split("?", 2);
  const safePathname = pathname.replace(/\/{2,}/g, "/").slice(0, MAX_PATH_LENGTH) || "/";
  if (!query) return safePathname;
  const safeParams = [];
  for (const part of query.split("&")) {
    const [key, rawValue = ""] = part.split("=");
    const safeKey = cleanString(decodeURIComponent(key || ""), 40);
    if (!safeKey || !SAFE_UTM_KEYS.has(safeKey) || SENSITIVE_PARAM_PATTERN.test(safeKey)) continue;
    safeParams.push(`${encodeURIComponent(safeKey)}=${encodeURIComponent(cleanString(decodeURIComponent(rawValue), 80))}`);
  }
  const suffix = safeParams.length ? `?${safeParams.join("&")}` : "";
  return `${safePathname}${suffix}`.slice(0, MAX_PATH_LENGTH);
};

const getReferrerHost = (value) => {
  const raw = cleanString(value, 300);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return cleanString(url.hostname.toLowerCase(), 160);
  } catch {
    return "";
  }
};

const getUtmFromPath = (path = "") => {
  const result = {};
  const query = String(path).split("?")[1] || "";
  if (!query) return result;
  const params = new URLSearchParams(query);
  result.utmSource = cleanString(params.get("utm_source") || "", 80);
  result.utmMedium = cleanString(params.get("utm_medium") || "", 80);
  result.utmCampaign = cleanString(params.get("utm_campaign") || "", 120);
  result.utmContent = cleanString(params.get("utm_content") || "", 120);
  return result;
};

const classifySource = ({ source, utmSource, referrerHost }) => {
  const raw = cleanString(source || utmSource, 80).toLowerCase();
  const host = cleanString(referrerHost, 160).toLowerCase();
  const haystack = `${raw} ${host}`;
  if (/instagram|l\.instagram\.com/.test(haystack)) return "instagram";
  if (/facebook|fb\.com|m\.facebook\.com|l\.facebook\.com/.test(haystack)) return "facebook";
  if (/tiktok/.test(haystack)) return "tiktok";
  if (/whatsapp|wa\.me/.test(haystack)) return "whatsapp";
  if (/google/.test(haystack)) return "google";
  if (!raw && !host) return "direct";
  if (raw === "direct") return "direct";
  return SOURCES.has(raw) ? raw : "other";
};

const getDeviceCategory = (ua = "") => {
  const value = String(ua || "").toLowerCase();
  if (!value) return "unknown";
  if (/ipad|tablet|kindle|silk/.test(value)) return "tablet";
  if (/mobile|iphone|android/.test(value)) return "mobile";
  if (/mozilla|chrome|safari|firefox|edge/.test(value)) return "desktop";
  return "unknown";
};

const isKnownBot = (ua = "") => KNOWN_BOT_REGEX.test(String(ua || ""));

const addDaysUtc = (date, days) => new Date(date.getTime() + days * DAY_MS);

const ignoreAnalyticsWriteError = () => {
  // Analytics is best-effort and must never break or delay user-facing flows.
};

const getExcludeReason = (req, path = "") => {
  const ua = req.get?.("user-agent") || "";
  const host = String(req.get?.("host") || req.get?.("x-forwarded-host") || "").toLowerCase();
  const origin = String(req.get?.("origin") || "").toLowerCase();
  const referer = String(req.get?.("referer") || "").toLowerCase();
  if (isKnownBot(ua)) return "bot";
  if (host.includes("localhost") || origin.includes("localhost")) return "localhost";
  if (host.includes(".vercel.app") || origin.includes(".vercel.app") || referer.includes(".vercel.app")) return "preview";
  if (path.startsWith("/api/") || path.startsWith("/uploads/") || path.startsWith("/_next/") || path.startsWith("/static/")) return "non_page";
  if (path.startsWith("/admin")) return "admin";
  if (path === "/api/health" || path === "/health") return "health";
  return "";
};

const sanitizeMetadata = (metadata = {}) => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const result = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!ALLOWED_METADATA_KEYS.has(key) || SENSITIVE_KEY_PATTERN.test(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) {
      result[key] = value;
    } else if (typeof value === "boolean") {
      result[key] = value;
    } else if (typeof value === "string") {
      result[key] = cleanString(value, 120);
    }
  }
  return result;
};

const buildAnalyticsEventInput = (payload = {}, req = {}) => {
  const eventName = cleanString(payload.eventName || payload.event, 80);
  if (!ALLOWED_ANALYTICS_EVENTS.has(eventName)) {
    const error = new Error("Evento de analítica no permitido");
    error.status = 400;
    throw error;
  }

  const anonymousVisitorId = cleanString(payload.anonymousVisitorId, 80);
  if (anonymousVisitorId && !VISITOR_ID_PATTERN.test(anonymousVisitorId)) {
    const error = new Error("Identificador de visitante inválido");
    error.status = 400;
    throw error;
  }

  const sessionId = cleanString(payload.sessionId, 80);
  if (sessionId && !SESSION_ID_PATTERN.test(sessionId)) {
    const error = new Error("Identificador de sesión inválido");
    error.status = 400;
    throw error;
  }

  const dedupeKey = cleanString(payload.dedupeKey, 180);
  if (dedupeKey && !DEDUPE_KEY_PATTERN.test(dedupeKey)) {
    const error = new Error("Clave de deduplicación inválida");
    error.status = 400;
    throw error;
  }

  const path = sanitizePath(payload.path);
  const pathUtm = getUtmFromPath(path);
  const referrerHost = getReferrerHost(payload.referrer);
  const source = classifySource({ source: payload.source, utmSource: payload.utmSource || pathUtm.utmSource, referrerHost });
  const deviceCategory = DEVICE_CATEGORIES.has(payload.deviceCategory)
    ? payload.deviceCategory
    : getDeviceCategory(req.get?.("user-agent"));
  const excludeReason = getExcludeReason(req, path);
  const createdAt = new Date();
  const expiresAt = addDaysUtc(createdAt, DETAIL_RETENTION_DAYS);

  return {
    event: eventName,
    eventName,
    anonymousVisitorId,
    sessionId,
    source,
    medium: cleanString(payload.medium || payload.utmMedium || pathUtm.utmMedium, 80),
    campaign: cleanString(payload.campaign || payload.utmCampaign || pathUtm.utmCampaign, 120),
    content: cleanString(payload.content || payload.utmContent || pathUtm.utmContent, 120),
    referrerHost,
    path,
    locale: cleanString(payload.locale, 12).toLowerCase(),
    deviceCategory,
    metadata: sanitizeMetadata(payload.metadata),
    dedupeKey,
    userId: req.userId || undefined,
    excluded: Boolean(excludeReason),
    excludeReason,
    expiresAt,
  };
};

/**
 * Record an analytics event. Fire-and-forget: errors are logged but never
 * propagate to the caller so a tracking failure can never break a user flow.
 *
 * @param {string} event   - One of the enum values in AnalyticsEvent.event
 * @param {string|null} userId - The acting user's ObjectId string (optional)
 * @param {object} data    - Event-specific payload (stored as-is)
 */
const trackAnalyticsEvent = (event, userId, data = {}) => {
  AnalyticsEvent.create({ event, eventName: event, ...(userId ? { userId } : {}), data }).catch((err) =>
    console.error(`[analytics] failed to track "${event}":`, err.message)
  );
};

const trackSafeAnalyticsEvent = (eventName, userId, metadata = {}) => {
  if (!ALLOWED_ANALYTICS_EVENTS.has(eventName)) return;
  const sanitizedMetadata = sanitizeMetadata(metadata);
  const doc = {
    event: eventName,
    eventName,
    ...(userId ? { userId } : {}),
    metadata: sanitizedMetadata,
    // Keep legacy `data` populated for existing admin metrics that still read it.
    data: sanitizedMetadata,
  };
  if (userId && ONCE_PER_USER_EVENTS.has(eventName)) {
    const dedupeKey = `${eventName}:user:${userId}`;
    AnalyticsEvent.findOneAndUpdate(
      { dedupeKey },
      { $setOnInsert: { ...doc, dedupeKey } },
      { upsert: true }
    ).catch(ignoreAnalyticsWriteError);
    return;
  }
  AnalyticsEvent.create(doc).catch(ignoreAnalyticsWriteError);
};

const recordPublicAnalyticsEvent = async (payload, req) => {
  const doc = buildAnalyticsEventInput(payload, req);
  if (doc.excluded) return { saved: false, excluded: true, reason: doc.excludeReason };
  if (doc.dedupeKey) {
    const result = await AnalyticsEvent.findOneAndUpdate(
      { dedupeKey: doc.dedupeKey },
      { $setOnInsert: doc },
      { upsert: true, new: true, rawResult: true }
    );
    return { saved: Boolean(result?.lastErrorObject?.upserted), duplicate: !result?.lastErrorObject?.upserted };
  }
  await AnalyticsEvent.create(doc);
  return { saved: true, duplicate: false };
};

const safePercent = (part, total) => total > 0 ? Number(((part / total) * 100).toFixed(1)) : 0;

module.exports = {
  ALLOWED_ANALYTICS_EVENTS,
  AUTHENTICATED_ANALYTICS_EVENTS,
  DETAIL_RETENTION_DAYS,
  PUBLIC_ANALYTICS_EVENTS,
  buildAnalyticsEventInput,
  classifySource,
  getDeviceCategory,
  recordPublicAnalyticsEvent,
  safePercent,
  sanitizeMetadata,
  sanitizePath,
  trackAnalyticsEvent,
  trackSafeAnalyticsEvent,
};
