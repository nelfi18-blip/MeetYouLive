/**
 * Status badge computation utility.
 *
 * Computes which status badges a user should display based on their profile data.
 * All logic is intentionally conservative – badges rely only on data already
 * returned by the public API so no extra requests are required.
 *
 * Badge definitions:
 *  🔥 Perfil destacado      – user has an active Boost (crushBoostUntil > now or isBoosted flag)
 *  🛡️ Verificado            – user.isVerified is true
 *  ⭐ Creador en tendencia   – creator currently streaming live (enriched with viewer/gift data)
 *  👑 Popular hoy           – user has >= POPULAR_FOLLOWERS_THRESHOLD followers
 *  💎 Top apoyo             – premium member or has received significant gifts
 */

/** Minimum followers count to earn the "Popular hoy" badge. */
const POPULAR_FOLLOWERS_THRESHOLD = 20;

/**
 * Viewer count threshold during a live stream to consider the creator "trending".
 * Kept low so the badge appears early and motivates viewers to join.
 */
const TRENDING_VIEWERS_THRESHOLD = 5;

/**
 * Gift coins received during a live session to be considered "trending".
 * Only used for tooltip enrichment; being live is still the primary criterion.
 */
const TRENDING_GIFTS_THRESHOLD = 10;

/**
 * Coins gifted to a creator (giftsTotal) that qualify them for 💎 Top apoyo
 * even without an explicit isPremium flag.
 */
const TOP_SUPPORT_GIFTS_THRESHOLD = 50;

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
 * @param {boolean} [opts.isBoosted]     – explicit boost flag (overrides user.isBoosted when provided)
 * @param {number}  [opts.viewerCount]   – live viewer count (for trending tooltip enrichment)
 * @param {number}  [opts.giftsTotal]    – total gift coins in the current live (for trending/support)
 * @returns {StatusBadge[]}
 */
export function computeStatusBadges(user, opts = {}) {
  if (!user) return [];

  const badges = [];

  // ── 🔥 Perfil destacado ──────────────────────────────────────────────────
  // Active when the explicit opt is set, user.isBoosted is true, or crushBoostUntil
  // is a future date (the boost has not yet expired).
  const boostUntil = user.crushBoostUntil ? new Date(user.crushBoostUntil) : null;
  const boostActive =
    opts.isBoosted !== undefined
      ? opts.isBoosted
      : !!user.isBoosted || (boostUntil !== null && boostUntil > new Date());

  if (boostActive) {
    let boostTooltip = "Perfil destacado por Boost activo";
    if (boostUntil && boostUntil > new Date()) {
      const minsLeft = Math.max(1, Math.round((boostUntil.getTime() - Date.now()) / 60_000));
      boostTooltip =
        minsLeft < 60
          ? `Boost activo · quedan ~${minsLeft} min`
          : `Boost activo · quedan ~${Math.round(minsLeft / 60)}h`;
    }
    badges.push({
      id: "boost",
      emoji: "🔥",
      label: "Perfil destacado",
      tooltip: boostTooltip,
      variant: "boost",
    });
  }

  // ── 🛡️ Verificado ────────────────────────────────────────────────────────
  if (user.isVerified) {
    badges.push({
      id: "verified",
      emoji: "🛡️",
      label: "Verificado",
      tooltip: "Identidad verificada",
      variant: "verified",
    });
  }

  // ── ⭐ Creador en tendencia ───────────────────────────────────────────────
  // Primary criterion: creator is streaming live right now.
  // Tooltip is enriched with real viewer/gift counts when available.
  const isCreator = user.role === "creator";
  const isLive = !!(user.isLive && user.liveId);
  if (isCreator && isLive) {
    const viewers = opts.viewerCount ?? 0;
    const gifts = opts.giftsTotal ?? 0;
    let trendTooltip = "Transmitiendo en vivo ahora";
    if (viewers >= TRENDING_VIEWERS_THRESHOLD && gifts >= TRENDING_GIFTS_THRESHOLD) {
      trendTooltip = `En vivo · ${viewers} espectadores · 🎁 ${gifts} monedas`;
    } else if (viewers >= TRENDING_VIEWERS_THRESHOLD) {
      trendTooltip = `En vivo · ${viewers} espectadores`;
    } else if (gifts >= TRENDING_GIFTS_THRESHOLD) {
      trendTooltip = `En vivo con regalos activos · 🎁 ${gifts} monedas`;
    }
    badges.push({
      id: "trending",
      emoji: "⭐",
      label: "Creador en tendencia",
      tooltip: trendTooltip,
      variant: "trending",
    });
  }

  // ── 👑 Popular hoy ───────────────────────────────────────────────────────
  const followers = user.followersCount ?? 0;
  if (followers >= POPULAR_FOLLOWERS_THRESHOLD) {
    const followerWord = followers === 1 ? "seguidor" : "seguidores";
    badges.push({
      id: "popular",
      emoji: "👑",
      label: "Popular hoy",
      tooltip: `${followers} ${followerWord} – perfil muy popular`,
      variant: "popular",
    });
  }

  // ── 💎 Top apoyo ─────────────────────────────────────────────────────────
  // Shown for Premium members, or when a creator has accumulated significant
  // gift coins (passed via opts.giftsTotal from live/card contexts).
  const giftsTotal = opts.giftsTotal ?? 0;
  if (user.isPremium || giftsTotal >= TOP_SUPPORT_GIFTS_THRESHOLD) {
    const topSupportTooltip = user.isPremium
      ? "Miembro Premium – apoya activamente a los creadores"
      : `Ha recibido 🎁 ${giftsTotal} monedas en regalos`;
    badges.push({
      id: "topSupport",
      emoji: "💎",
      label: "Top apoyo",
      tooltip: topSupportTooltip,
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
