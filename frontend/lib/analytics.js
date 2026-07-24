const VISITOR_KEY = "analyticsVisitorId";
const SESSION_KEY = "analyticsSessionId";
const SESSION_LAST_SEEN_KEY = "analyticsSessionLastSeenAt";
const ACQUISITION_KEY = "analyticsAcquisition";
const DEDUPE_PREFIX = "analyticsDedupe:";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const ATTRIBUTION_DAYS = 30;

const PUBLIC_EVENTS = new Set([
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

function canTrack() {
  if (typeof window === "undefined") return false;
  const dnt = navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack;
  return dnt !== "1" && dnt !== "yes";
}

function randomId(prefix) {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function setVisitorCookie(value) {
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${VISITOR_KEY}=${encodeURIComponent(value)}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${secure}`;
  } catch {}
}

function getOrCreateVisitorId() {
  let visitorId = localStorage.getItem(VISITOR_KEY);
  if (!visitorId) {
    visitorId = randomId("v");
    localStorage.setItem(VISITOR_KEY, visitorId);
  }
  setVisitorCookie(visitorId);
  return visitorId;
}

function getOrCreateSessionId() {
  const now = Date.now();
  const lastSeen = Number(sessionStorage.getItem(SESSION_LAST_SEEN_KEY) || 0);
  let sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId || now - lastSeen > SESSION_TIMEOUT_MS) {
    sessionId = randomId("s");
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }
  sessionStorage.setItem(SESSION_LAST_SEEN_KEY, String(now));
  return sessionId;
}

function getSafePath() {
  const safeParams = new URLSearchParams();
  const currentParams = new URLSearchParams(window.location.search);
  ["utm_source", "utm_medium", "utm_campaign", "utm_content"].forEach((key) => {
    const value = currentParams.get(key);
    if (value) safeParams.set(key, value.slice(0, 120));
  });
  const query = safeParams.toString();
  return `${window.location.pathname}${query ? `?${query}` : ""}`;
}

function getAcquisition() {
  const existingRaw = localStorage.getItem(ACQUISITION_KEY);
  if (existingRaw) {
    try {
      const existing = JSON.parse(existingRaw);
      if (Date.now() - Number(existing.createdAt || 0) < ATTRIBUTION_DAYS * 24 * 60 * 60 * 1000) {
        return existing;
      }
    } catch {}
  }

  const params = new URLSearchParams(window.location.search);
  const acquisition = {
    utmSource: params.get("utm_source") || "",
    utmMedium: params.get("utm_medium") || "",
    utmCampaign: params.get("utm_campaign") || "",
    utmContent: params.get("utm_content") || "",
    referrer: document.referrer || "",
    createdAt: Date.now(),
  };
  localStorage.setItem(ACQUISITION_KEY, JSON.stringify(acquisition));
  return acquisition;
}

function getDeviceCategory() {
  const ua = navigator.userAgent || "";
  if (/ipad|tablet|kindle|silk/i.test(ua)) return "tablet";
  if (/mobile|iphone|android/i.test(ua)) return "mobile";
  if (ua) return "desktop";
  return "unknown";
}

function shouldDedupe(dedupeKey) {
  if (!dedupeKey) return false;
  const key = `${DEDUPE_PREFIX}${dedupeKey}`;
  const now = Date.now();
  const previous = Number(sessionStorage.getItem(key) || 0);
  if (previous && now - previous < 2000) return true;
  sessionStorage.setItem(key, String(now));
  return false;
}

export function trackAnalyticsEvent(eventName, metadata = {}, options = {}) {
  try {
    if (!canTrack() || !PUBLIC_EVENTS.has(eventName)) return;
    const anonymousVisitorId = getOrCreateVisitorId();
    const sessionId = getOrCreateSessionId();
    const dedupeKey = options.dedupeKey || `${eventName}:${anonymousVisitorId}:${sessionId}:${getSafePath()}`;
    if (shouldDedupe(dedupeKey)) return;
    const acquisition = getAcquisition();
    const body = JSON.stringify({
      eventName,
      anonymousVisitorId,
      sessionId,
      dedupeKey,
      path: getSafePath(),
      locale: document.documentElement.lang || navigator.language || "en",
      deviceCategory: getDeviceCategory(),
      metadata,
      ...acquisition,
    });
    const url = `${process.env.NEXT_PUBLIC_API_URL}/api/analytics/events`;
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(url, blob)) return;
    }
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch {}
}

export function ensureAnalyticsVisitor() {
  if (!canTrack()) return null;
  return getOrCreateVisitorId();
}
