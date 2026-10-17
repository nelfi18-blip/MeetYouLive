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
 * Hard stop on real Vercel Production, regardless of the opt-in flag:
 * a real Vercel Production deployment must NEVER show the demo controls,
 * even if `NEXT_PUBLIC_MYL_WORLD_BEYOND_DEMO_ENABLED=true` was set there by
 * mistake — mirroring the same hard-stop pattern already used by
 * `giftAnimationsPreviewAccess.js` for the `/dev` preview route. The demo
 * is only ever allowed on a Vercel Preview deployment or in local
 * Development (`next dev`/non-Vercel builds), and only when the flag is
 * explicitly set to "true" in either case — it is never default-on.
 *
 * Vercel automatically exposes `NEXT_PUBLIC_VERCEL_ENV` to the client
 * bundle (Next.js "Automatically expose System Environment Variables"),
 * so this is the `NEXT_PUBLIC_`-prefixed counterpart of `VERCEL_ENV` that a
 * client component like the Live room can actually read at runtime.
 *
 * @param {object} [env]
 * @param {string|undefined} [env.demoFlag] - defaults to
 *   process.env.NEXT_PUBLIC_MYL_WORLD_BEYOND_DEMO_ENABLED
 * @param {string|undefined} [env.vercelEnv] - defaults to
 *   process.env.NEXT_PUBLIC_VERCEL_ENV ("production" | "preview" |
 *   "development" on Vercel, undefined off Vercel)
 * @returns {boolean} whether the MYL World & Beyond demo controls should render
 */
export function resolveMylWorldBeyondDemoAccess({
  demoFlag = process.env.NEXT_PUBLIC_MYL_WORLD_BEYOND_DEMO_ENABLED,
  vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV,
} = {}) {
  // Hard stop, checked first and unconditionally: a real Vercel Production
  // deployment must never show the demo controls, no matter how the
  // opt-in flag is configured.
  if (vercelEnv === "production") {
    return false;
  }

  // Every other case — Vercel Preview, Vercel "development" env, or a
  // non-Vercel build (local `next dev`/`next build`, CI, etc.) — only
  // enables the demo when explicitly opted in via the flag. Never
  // default-on.
  const flagEnabled = String(demoFlag).toLowerCase() === "true";
  return flagEnabled;
}

/** Convenience wrapper that reads the live process.env values. */
export function isMylWorldBeyondDemoEnabled() {
  return resolveMylWorldBeyondDemoAccess({});
}
