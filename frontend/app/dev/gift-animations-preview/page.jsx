import { isGiftAnimationsPreviewEnabled } from "@/lib/giftAnimationsPreviewAccess";
import GiftAnimationsPreviewClient from "./GiftAnimationsPreviewClient";

/**
 * /dev/gift-animations-preview — isolated, dev-only preview
 *
 * Shows the first three MYL World & Beyond animated gift CONCEPTS
 * (Eiffel Tower, Explorer Ship, Connected Planet) so the visuals can be
 * reviewed before any monetization work begins.
 *
 * This file is deliberately a Server Component (no "use client"): the
 * access decision in lib/giftAnimationsPreviewAccess.js reads VERCEL_ENV
 * and a non-"NEXT_PUBLIC_"-prefixed opt-in flag, both of which must stay
 * server-side only and are never sent to the client bundle. The actual
 * interactive UI lives in the separate GiftAnimationsPreviewClient
 * component, which only ever gets rendered once this gate passes.
 *
 * Layers of protection (see MYL_WORLD_BEYOND_GIFT_ANIMATIONS_PREVIEW.md):
 *  1. This env-based gate — disabled by default, never enabled on a real
 *     Vercel Production deployment regardless of the opt-in flag, and
 *     requires an explicit opt-in on Preview deployments.
 *  2. A logged-in session is still required, same as any other protected
 *     route (see lib/publicAccess.js PROTECTED_ROUTE_PREFIXES: "/dev").
 *  3. "X-Robots-Tag: noindex, nofollow" tagging in middleware.js.
 * None of these three is relied on alone.
 *
 * Also: never calls any backend endpoint — no Coins are charged, no
 * balance is read or written, and nothing is added to the real gift
 * catalog.
 */
export default function GiftAnimationsPreviewPage() {
  if (!isGiftAnimationsPreviewEnabled()) {
    return (
      <div style={{ padding: "4rem 1.5rem", textAlign: "center", color: "#94a3b8" }}>
        <h1 style={{ color: "#f8fafc" }}>404</h1>
        <p>This preview is only available in non-production environments.</p>
      </div>
    );
  }

  return <GiftAnimationsPreviewClient />;
}
