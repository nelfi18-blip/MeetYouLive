export const SAFE_NOTIFICATION_PREFIXES = [
  "/chats",
  "/chat",
  "/call",
  "/calls",
  "/live",
  "/profile",
  "/coins",
  "/creator",
  "/creator-center",
  "/dashboard/creator",
  "/wallet",
  "/matches",
  "/match",
  "/crush",
  "/vip",
  "/settings/notifications",
];
const DEFAULT_APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://meetyoulive.net";
const COINS_NOTIFICATION_KEYWORDS = ["coin", "purchase", "payment", "subscription"];

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() || "";
}

function getAllowedOrigins(origin) {
  const origins = new Set([origin, DEFAULT_APP_ORIGIN, "https://meetyoulive.net", "https://www.meetyoulive.net"]);
  return new Set(
    Array.from(origins).map((value) => {
      try {
        return new URL(value).origin;
      } catch {
        return value;
      }
    })
  );
}

function sanitizeNotificationPath(link, origin = DEFAULT_APP_ORIGIN) {
  if (typeof link !== "string" || !link) return "/";
  try {
    const parsed = link.startsWith("/") ? new URL(link, origin) : new URL(link);
    if (!link.startsWith("/") && !getAllowedOrigins(origin).has(parsed.origin)) return "/";
    const path = parsed.pathname || "/";
    const allowed = SAFE_NOTIFICATION_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
    return allowed ? `${path}${parsed.search}${parsed.hash}` : "/";
  } catch {
    return "/";
  }
}

function getPathFromNotificationData(data) {
  if (!data || typeof data !== "object") return "/";

  // firstString returns "" when absent; empty strings are safe to normalize.
  const type = firstString(data.type, data.notificationType, data.category).toLowerCase();
  const chatId = firstString(data.chatId, data.conversationId, data.threadId);
  const liveId = firstString(data.liveId, data.live);
  const callId = firstString(data.callId);
  const profileId = firstString(data.profileId, data.userId, data.creatorId);

  if (type.includes("message") || type === "chat") {
    return chatId ? `/chats/${chatId}` : "/chats";
  }
  if (type.includes("match")) {
    return "/matches";
  }
  if (type.includes("call")) {
    return callId ? `/call/${callId}` : "/calls";
  }
  if (type.includes("live")) {
    return liveId ? `/live/${liveId}` : "/live";
  }
  if (type.includes("profile") || type.includes("creator")) {
    return profileId ? `/profile/${profileId}` : "/profile";
  }
  if (type.includes("withdrawal") || type.includes("wallet")) {
    return "/wallet";
  }
  if (COINS_NOTIFICATION_KEYWORDS.some((keyword) => type.includes(keyword))) {
    return "/coins";
  }

  return "/";
}

/**
 * Resolve a native push tap destination.
 * Accepts either a raw link string or a Capacitor notification data object.
 * Explicit safe links win first; when absent/unsafe, typed FCM data falls back
 * to the matching app screen (chat, match, live, profile, coins, or wallet).
 */
export function getNativeNotificationPath(notification, origin = DEFAULT_APP_ORIGIN) {
  if (typeof notification === "string") {
    return sanitizeNotificationPath(notification, origin);
  }

  const data = notification && typeof notification === "object" ? notification : {};
  const linkPath = sanitizeNotificationPath(firstString(data.link, data.url, data.path), origin);
  if (linkPath !== "/") return linkPath;

  return getPathFromNotificationData(data);
}
