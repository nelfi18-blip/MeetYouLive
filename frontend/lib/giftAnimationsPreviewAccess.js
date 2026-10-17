/**
 * Access control for the isolated /dev/gift-animations-preview route.
 *
 * This is intentionally a plain, server-safe module (no "use client", no
 * React) so it can run:
 *  - inside the Next.js Server Component that renders the route, where
 *    non-"NEXT_PUBLIC_"-prefixed env vars (like VERCEL_ENV and our own
 *    opt-in flag) are readable but never bundled into client JS, and
 *  - directly from `node --test` for unit coverage, by passing explicit
 *    env values instead of relying on `process.env`.
 *
 * Why not just `process.env.NODE_ENV !== "production"`?
 * Vercel Preview deployments build and run with NODE_ENV="production" —
 * identical to a real Production deployment. Gating purely on NODE_ENV
 * therefore also hides the preview from legitimate Vercel Preview
 * deployments, which is the problem this module fixes.
 *
 * Design goals (see MYL_WORLD_BEYOND_GIFT_ANIMATIONS_PREVIEW.md):
 *  - Visible on a Vercel Preview deployment, but only after an explicit,
 *    non-secret opt-in env var is set on that environment's scope.
 *  - Never visible on a real Vercel Production deployment — this check
 *    comes first and ignores the opt-in flag entirely, so the flag being
 *    set accidentally on Production can never expose the route there.
 *  - No secret value is involved: GIFT_ANIMATIONS_PREVIEW_ENABLED is a
 *    plain boolean-ish switch, not a key/token, and it is read server-side
 *    only (never prefixed with NEXT_PUBLIC_, so it's never sent to the
 *    client bundle).
 *  - This is only ONE of several layers (see also the "/dev" auth
 *    requirement in lib/publicAccess.js and the noindex tagging in
 *    middleware.js) — it must not be the sole safeguard.
 */

/**
 * @param {object} [env]
 * @param {string|undefined} [env.nodeEnv] - defaults to process.env.NODE_ENV
 * @param {string|undefined} [env.vercelEnv] - defaults to process.env.VERCEL_ENV
 *   ("production" | "preview" | "development" on Vercel, undefined off Vercel)
 * @param {string|undefined} [env.previewFlag] - defaults to
 *   process.env.GIFT_ANIMATIONS_PREVIEW_ENABLED, expected to be the string
 *   "true" when explicitly opted in on a Preview environment's scope.
 * @returns {boolean} whether the preview route should render its content
 */
export function resolveGiftAnimationsPreviewAccess({
  nodeEnv = process.env.NODE_ENV,
  vercelEnv = process.env.VERCEL_ENV,
  previewFlag = process.env.GIFT_ANIMATIONS_PREVIEW_ENABLED,
} = {}) {
  const flagEnabled = String(previewFlag).toLowerCase() === "true";

  // Hard stop, checked first and unconditionally: a real Vercel Production
  // deployment must never show this preview, no matter how the opt-in flag
  // is configured.
  if (vercelEnv === "production") {
    return false;
  }

  // Vercel Preview deployments: NODE_ENV is "production" here too, so an
  // explicit, non-secret opt-in flag (set only on the Preview environment
  // scope in the Vercel project settings) is required.
  if (vercelEnv === "preview") {
    return flagEnabled;
  }

  // Not a Vercel deployment at all (local `next dev`/`next build`, another
  // host, CI, or Vercel's own "development" env): keep the simple rule of
  // "available whenever this isn't a production build".
  if (nodeEnv && nodeEnv !== "production") {
    return true;
  }

  // Fail-safe default: an unrecognized production-like build (e.g.
  // NODE_ENV=production with no VERCEL_ENV at all) stays disabled.
  return false;
}

/** Convenience wrapper that reads live process.env values. */
export function isGiftAnimationsPreviewEnabled() {
  return resolveGiftAnimationsPreviewAccess({});
}
