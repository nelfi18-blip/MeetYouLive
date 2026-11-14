import { isApprovedCreator, isFullCreator } from "./creatorUtils.js";

/**
 * Menu links for the universe preview. All paths are existing Next.js routes.
 * The backend/middleware still enforce permissions when a route is opened.
 * This helper NEVER changes roles or creates a creator application.
 */
export function getUniverseAccountLinks(profile, { authenticated = false, admin = false } = {}) {
  if (admin) return [{ id: "admin", href: "/admin" }];

  if (!authenticated) {
    return [
      { id: "login", href: "/login?callbackUrl=%2Ffeed" },
      { id: "register", href: "/register" },
      // An anonymous visitor can find Chat, then sign in and return to it.
      { id: "chats", href: "/login?callbackUrl=%2Fchats" },
      { id: "request", href: "/login?callbackUrl=%2Fcreator-request" },
    ];
  }

  // A regular account can always reach existing social pages.
  const links = [
    { id: "home", href: "/dashboard" },
    { id: "profile", href: "/profile" },
    { id: "chats", href: "/chats" },
    { id: "explore", href: "/explore" },
    { id: "settings", href: "/settings" },
  ];

  // No assumption about creator eligibility if the profile fetch failed.
  if (!profile) return links;

  if (isApprovedCreator(profile)) {
    links.push({ id: "creator", href: "/creator" });
    links.push({ id: "goLive", href: "/live/start" });
    if (isFullCreator(profile)) links.push({ id: "agency", href: "/agency" });
    return links;
  }

  const status = profile.creatorStatus || profile.creatorApplication?.status || "";
  if (status === "pending" || status === "in_review") {
    links.push({ id: "requestPending", href: "/creator-request" });
  } else if (status === "rejected" || status === "suspended") {
    links.push({ id: "requestReview", href: "/creator-request" });
  } else {
    links.push({ id: "request", href: "/creator-request" });
  }
  return links;
}
