import { isApprovedCreator } from "./creatorUtils.js";

/**
 * Universe is a single entry point to EXISTING screens, not an alternative
 * login, messages, checkout or creator application. The backend and the
 * existing page guards remain authoritative.
 *
 * Every personal route is visible in the isolated preview, even when
 * signed out, but leads through the current /login callback flow.
 * Never advertise an unverified privilege as an available option.
 */
export const UNIVERSE_ACCOUNT_ROUTES = Object.freeze([
  { id: "chats", href: "/chats", group: "communication" },
  { id: "calls", href: "/calls", group: "communication" },
  { id: "matches", href: "/matches", group: "communication" },
  { id: "notifications", href: "/notifications", group: "communication" },
  { id: "profile", href: "/profile", group: "account" },
  { id: "home", href: "/dashboard", group: "account" },
  { id: "settings", href: "/settings", group: "account" },
  { id: "referral", href: "/referral", group: "account" },
  { id: "wallet", href: "/wallet", group: "money" },
  { id: "coins", href: "/coins", group: "money" },
  // /gifts shows the user's existing received-gift history, not a new store.
  { id: "gifts", href: "/gifts", group: "money" },
  { id: "passes", href: "/passes", group: "money" },
  { id: "vip", href: "/vip", group: "money" },
  { id: "subscription", href: "/subscription", group: "money" },
]);

function gatedLink(item) {
  return { ...item, href: `/login?callbackUrl=${encodeURIComponent(item.href)}` };
}

export function getUniverseAccountLinks(profile, { authenticated = false, admin = false } = {}) {
  if (admin) return [{ id: "admin", href: "/admin", group: "account" }];

  const links = authenticated
    ? UNIVERSE_ACCOUNT_ROUTES.map((item) => ({ ...item }))
    : UNIVERSE_ACCOUNT_ROUTES.map(gatedLink);

  // Creator status comes from /api/user/me, not the session token or UI.
  if (authenticated && profile && isApprovedCreator(profile)) {
    links.push({ id: "creator", href: "/creator", group: "creator" });
    links.push({ id: "goLive", href: "/live/start", group: "creator" });
    // Agency privileges are verified inside the existing /creator panel.
  } else {
    const status = authenticated && profile
      ? (profile.creatorStatus || profile.creatorApplication?.status || "")
      : "";
    const requestId = status === "pending" || status === "in_review"
      ? "requestPending"
      : status === "rejected" || status === "suspended"
        ? "requestReview"
        : "request";
    const request = { id: requestId, href: "/creator-request", group: "creator" };
    links.push(authenticated ? request : gatedLink(request));
  }

  // Help center is genuinely public. It never asks visitors to sign in.
  links.push({ id: "help", href: "/help-center", group: "help" });
  return links;
}
