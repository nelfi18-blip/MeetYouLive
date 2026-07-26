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
const APP_ORIGINS = new Set(["https://meetyoulive.net", "https://www.meetyoulive.net"]);

export function getNativeNotificationPath(link, origin = "https://meetyoulive.net") {
  if (typeof link !== "string" || !link) return "/";
  try {
    const parsed = link.startsWith("/") ? new URL(link, origin) : new URL(link);
    if (!link.startsWith("/") && !APP_ORIGINS.has(parsed.origin)) return "/";
    const path = parsed.pathname || "/";
    const allowed = SAFE_NOTIFICATION_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
    return allowed ? `${path}${parsed.search}${parsed.hash}` : "/";
  } catch {
    return "/";
  }
}
