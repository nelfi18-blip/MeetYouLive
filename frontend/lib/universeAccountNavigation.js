import { isApprovedCreator } from "./creatorUtils.js";

/**
 * Menu links for the universe preview. All paths are existing Next.js routes.
 * The backend/middleware still enforce permissions when a route is opened.
 * This helper NEVER changes roles or creates a creator application.
 */
export function getUniverseAccountLinks(profile, { authenticated = false, admin = false } = {}) {
  if (admin) return [{ id: "admin", href: "/admin" }];

  if (!authenticated) {
    return [
      // The universe is not a second registration or sign-in screen.
      // Protected destinations use the existing login and account creation flow.
      // An anonymous visitor can find Chat, then sign in and return to it.
      { id: "chats", href: "/login?callbackUrl=%2Fchats" },
      { id: "coins", href: "/login?callbackUrl=%2Fcoins" },
      { id: "request", href: "/login?callbackUrl=%2Fcreator-request" },
    ];
  }

  // A regular account can always reach existing social pages.
  const links = [
    // Chat is intentionally first so every signed-in user can find it fast.
    { id: "chats", href: "/chats" },
    { id: "profile", href: "/profile" },
    { id: "home", href: "/dashboard" },
    { id: "notifications", href: "/notifications" },
    { id: "wallet", href: "/wallet" },
    { id: "coins", href: "/coins" },
    { id: "settings", href: "/settings" },
  ];

  // No assumption about creator eligibility if the profile fetch failed.
  if (!profile) return links;

  if (isApprovedCreator(profile)) {
    links.push({ id: "creator", href: "/creator" });
    links.push({ id: "goLive", href: "/live/start" });
    // Agency eligibility and application live inside /creator. Showing
    // /agency from this menu based solely on the creator role would imply
    // approval the account may not have.
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
