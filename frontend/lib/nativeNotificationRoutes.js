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

export function getNativeNotificationPath(link, origin = DEFAULT_APP_ORIGIN) {
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
