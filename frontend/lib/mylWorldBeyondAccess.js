/**
 * Access control for the MYL World & Beyond demo trigger inside the real
 * Live room (`app/live/[id]/page.jsx`).
 *
 * This is deliberately separate from the commercial gift-sending flow: it
 * only decides whether the creator-only "demo" controls (three buttons that
 * play the Torre Eiffel mágica / Nave exploradora / Planeta conectado
 * animations with local demo data) are rendered at all. It never decides
 * anything about the real gift catalog, Coins, or `/api/gifts/send`.
 *
 * Disabled by default. This keeps the commercial integration (real gift
 * entries, pricing, catalog wiring) fully gated behind a later, explicit
 * approval: shipping this flag as "off" means the demo controls simply
 * don't render anywhere, even though the underlying animation components
 * and this player exist in the bundle.
 *
 * `NEXT_PUBLIC_MYL_WORLD_BEYOND_DEMO_ENABLED` is intentionally
 * `NEXT_PUBLIC_`-prefixed (unlike the dev-preview route's opt-in flag)
 * because this check has to run inside a client component (the Live room
 * is fully "use client"). It is not a secret — just a plain boolean
 * opt-in switch for an unreleased visual concept.
 *
 * @param {object} [env]
 * @param {string|undefined} [env.demoFlag] - defaults to
 *   process.env.NEXT_PUBLIC_MYL_WORLD_BEYOND_DEMO_ENABLED
 * @returns {boolean} whether the MYL World & Beyond demo controls should render
 */
export function resolveMylWorldBeyondDemoAccess({
  demoFlag = process.env.NEXT_PUBLIC_MYL_WORLD_BEYOND_DEMO_ENABLED,
} = {}) {
  return String(demoFlag).toLowerCase() === "true";
}

/** Convenience wrapper that reads the live process.env value. */
export function isMylWorldBeyondDemoEnabled() {
  return resolveMylWorldBeyondDemoAccess({});
}
