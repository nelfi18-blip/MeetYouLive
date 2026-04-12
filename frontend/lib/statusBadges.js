/**
 * Status badge computation utility.
 *
 * Computes which status badges a user should display based on their profile data.
 * All logic is intentionally conservative – badges rely only on data already
 * returned by the public API so no extra requests are required.
 *
 * Badge definitions:
 *  🔥 Perfil destacado  – user has an active Boost (crushBoostUntil > now)
 *  👑 Popular hoy       – user has >= POPULAR_FOLLOWERS_THRESHOLD followers
 *  💎 Top apoyo         – user is a premium subscriber
 *  ⭐ Creador en tendencia – creator currently streaming live
 */

/** Minimum followers count to earn the "Popular hoy" badge. */
const POPULAR_FOLLOWERS_THRESHOLD = 20;

/**
 * @typedef {Object} StatusBadge
 * @property {string} id       – unique identifier
 * @property {string} emoji    – emoji icon
 * @property {string} label    – short label shown in the badge
 * @property {string} tooltip  – longer explanation / CTA
 * @property {string} variant  – maps to a CSS class suffix in StatusBadges.jsx
 */

/**
 * Compute applicable status badges for a user object.
 *
 * @param {Object} user – user profile object (fields may be undefined/null for other-users)
 * @param {Object} [opts]
 * @param {boolean} [opts.isBoosted]  – explicit boost flag (overrides user.isBoosted when provided)
 * @returns {StatusBadge[]}
 */
export function computeStatusBadges(user, opts = {}) {
  if (!user) return [];

  const badges = [];

  // ── 🔥 Perfil destacado ──────────────────────────────────────────────────
  const boosted =
    opts.isBoosted !== undefined ? opts.isBoosted : !!user.isBoosted;
  if (boosted) {
    badges.push({
      id: "boost",
      emoji: "🔥",
      label: "Perfil destacado",
      tooltip: "Este perfil está usando Boost para mayor visibilidad",
      variant: "boost",
    });
  }

  // ── ⭐ Creador en tendencia ───────────────────────────────────────────────
  const isCreator = user.role === "creator";
  const isLive = !!(user.isLive && user.liveId);
  if (isCreator && isLive) {
    badges.push({
      id: "trending",
      emoji: "⭐",
      label: "Creador en tendencia",
      tooltip: "Este creador está transmitiendo en vivo ahora",
      variant: "trending",
    });
  }

  // ── 👑 Popular hoy ───────────────────────────────────────────────────────
  const followers = user.followersCount ?? 0;
  if (followers >= POPULAR_FOLLOWERS_THRESHOLD) {
    badges.push({
      id: "popular",
      emoji: "👑",
      label: "Popular hoy",
      tooltip: `${followers} seguidores – perfil muy popular`,
      variant: "popular",
    });
  }

  // ── 💎 Top apoyo ─────────────────────────────────────────────────────────
  if (user.isPremium) {
    badges.push({
      id: "topSupport",
      emoji: "💎",
      label: "Top apoyo",
      tooltip: "Miembro Premium – apoya a los creadores",
      variant: "topSupport",
    });
  }

  return badges;
}

/**
 * Returns a monetization nudge CTA for users who have no status badges.
 * Use this to gently encourage Boost purchases.
 *
 * @param {StatusBadge[]} badges – result of computeStatusBadges
 * @returns {{ show: boolean, text: string, href: string } | null}
 */
export function getBoostNudge(badges) {
  if (badges.length > 0) return null;
  return {
    show: true,
    text: "Activa Boost para destacar tu perfil",
    href: "/crush",
  };
}
