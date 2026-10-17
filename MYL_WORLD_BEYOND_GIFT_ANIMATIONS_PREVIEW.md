# MYL World & Beyond — Gift Animations Preview (dev-only)

Status: **preview only, not monetized, not in the active catalog.**

This document describes the first three animated gift concepts for the
future "MYL World & Beyond" collection, the isolated preview route created
to review them, and the known limitations of the current implementation.

## What was built

Three original, hand-authored SVG + CSS animations (no emoji stand-ins, no
3D engine, no video/GIF assets):

| Gift | Proposed Coins | Target duration | Tier |
|---|---|---|---|
| 🗼 Torre Eiffel mágica | 300 | 3s | Medium |
| 🚀 Nave exploradora | 800 | 4s | Premium |
| 🌍 Planeta conectado | 8,000 | 5s | Legendary |

Components (`frontend/components/gifts/previews/`):
- `EiffelTowerGiftPreview.jsx` — the tower is drawn progressively via an
  SVG `stroke-dasharray` reveal, then lights up gold with pulsing glow,
  blinking beacon, golden sparkle flares, and one gentle `rotateY` tilt.
- `ExplorerShipGiftPreview.jsx` — a recognizable ship silhouette (hull,
  cockpit, wing fins) flies in from the left, crosses the stage leaving a
  fading luminous CSS-gradient trail, and exits off the right edge.
- `ConnectedPlanetGiftPreview.jsx` — a continuously spinning globe with
  stylized continent shapes, pulsing glowing arcs connecting points around
  the globe, a cosmic "expansion ring" burst, and a graceful fade/close.

Each component:
- Is a self-contained, inline (non full-screen) preview card — it does not
  take over the viewport and can be shown side-by-side with the other two.
- Declares its own duration constant and calls `onComplete` exactly once
  when the cycle ends.
- Clears all of its `setTimeout` timers on unmount (`timersRef.current`),
  so no dangling timers or memory growth across repeated replays.
- Fully respects `prefers-reduced-motion: reduce` (drops continuous loops,
  shows the end state immediately instead of silently doing nothing).
- Has a `max-width: 480px` responsive rule so it scales down cleanly on
  phones.
- Makes **zero** network calls — no `fetch`, no Coins/balance reads, no
  gift-send or purchase endpoints (verified by
  `frontend/tests/gift-animations-preview.test.mjs`).

A preview-only manifest, `frontend/lib/giftAnimationsPreviewCatalog.js`,
lists the three concepts with their proposed Coin values and durations.
It is explicitly **not** wired into `frontend/lib/gifts.js`, the backend
`GiftCatalog`/`Gift` models, or any send/purchase flow.

## Where to see it

`frontend/app/dev/gift-animations-preview/` (route: `/dev/gift-animations-preview`):
- `layout.jsx` — sets `robots: { index: false, follow: false }` metadata,
  mirroring `frontend/app/admin/layout.jsx`.
- `page.jsx` — a **Server Component** that only decides whether to render
  the preview at all (see "How it stays protected" below); it never ships
  any interactive code itself.
- `GiftAnimationsPreviewClient.jsx` — the actual interactive UI (three
  preview cards, each with a "Replay" button). Only ever mounted once
  `page.jsx`'s gate passes.

### How it stays protected

1. **Environment-aware gate** (`frontend/lib/giftAnimationsPreviewAccess.js`,
   consumed from the Server Component `page.jsx`):
   - On a real **Vercel Production** deployment (`VERCEL_ENV === "production"`)
     the preview is **always** disabled — this check runs first and ignores
     the opt-in flag entirely, so the flag being set by mistake on
     Production can never expose the route there.
   - On a **Vercel Preview** deployment (`VERCEL_ENV === "preview"`), the
     preview only renders if the non-secret opt-in env var
     `GIFT_ANIMATIONS_PREVIEW_ENABLED=true` is explicitly set **on that
     Preview environment's scope** in the Vercel project settings. This is
     what fixes the original problem: Vercel Preview builds set
     `NODE_ENV=production` too, so a plain `NODE_ENV` check could never
     tell a Preview deployment apart from real Production and hid the
     preview from Preview deployments entirely.
   - Outside Vercel (local `next dev`/`next build`, CI, etc.), the previous
     simple rule still applies: available whenever `NODE_ENV !== "production"`.
   - Any other unrecognized production-like build fails safe (disabled).
   - `GIFT_ANIMATIONS_PREVIEW_ENABLED` is **not** prefixed with
     `NEXT_PUBLIC_`, so it is read only on the server and is never bundled
     into client-side JavaScript. It is not a secret/key — just a plain
     boolean opt-in switch — so nothing sensitive is exposed to the
     frontend.
2. **Auth-required route**: `/dev` was added to
   `PROTECTED_ROUTE_PREFIXES` in `frontend/lib/publicAccess.js`, so
   `middleware.js` redirects unauthenticated visitors to `/login` just
   like any other protected page.
3. **No indexing**: `middleware.js` tags `/dev/*` responses with
   `X-Robots-Tag: noindex, nofollow`, same as `/admin/*`.

None of these three layers is relied on alone — the env gate is the
primary safeguard against public exposure, the session requirement and
noindex tagging are additional layers on top of it.

### Enabling the preview on a Vercel Preview deployment

In the Vercel project's **Preview** environment variable scope only (never
Production), set:

```
GIFT_ANIMATIONS_PREVIEW_ENABLED=true
```

Preview deployments built after that change will render the preview at
`/dev/gift-animations-preview` for an authenticated user. Production
deployments ignore this variable completely.

## Internationalization

New strings live under the `giftAnimationsPreview` key in
`frontend/messages/{en,es,pt}.json` (title, subtitle, disclaimer, labels,
tier names, and each gift's name/description). Key parity across the three
locales is enforced by the existing
`frontend/tests/i18n-key-parity.test.mjs`.

## Validation performed

- `npm run lint` (ESLint, `--max-warnings=0`) — clean.
- `npm run build` (`next build`) — compiles successfully; the route
  `/dev/gift-animations-preview` appears in the build output as a
  server-rendered (`ƒ`) route.
- `node --test tests/gift-animations-preview.test.mjs` — 24 focused tests
  covering: route protection (`isProtectedRoutePath`,
  `shouldRedirectUnauthenticatedToLogin`), middleware noindex tagging,
  layout robots metadata, that `page.jsx` is a Server Component gating via
  `isGiftAnimationsPreviewEnabled`, the full `resolveGiftAnimationsPreviewAccess`
  decision matrix (Production always disabled even with the flag set,
  Preview requires the explicit flag, non-Vercel builds keep the previous
  `NODE_ENV` behavior, unrecognized production-like builds fail safe), that
  the opt-in env var is never `NEXT_PUBLIC_`-prefixed, absence of any
  network/purchase/Coins API usage across the page/client/catalog, the
  proposed Coin values/durations, per-component timer cleanup,
  `prefers-reduced-motion` support, and the mobile breakpoint.
- Full existing frontend test suite (`tests/*.test.mjs`) re-run — no new
  failures introduced (a handful of pre-existing, unrelated failures — in
  `legal-footer`, `live-discovery-quick-gifts`, `live-random-entry-point`,
  `multi-video-grid-layout` — were confirmed present on the base branch
  before this change, via `git stash`).
- Manually verified in the built app at `max-width: 480px`/`360px`
  viewport sizes that each animation scales down, finishes, and its
  "Replay" button correctly remounts (and thus resets) the component.
- Confirmed no Coins balance, catalog, Stripe, Agora, Socket.io, or
  authentication code paths were touched.

## Known limitations

- These are **concept/preview** animations meant to validate direction and
  pacing, not final production-ready art assets. A design pass (exact
  color grading, icon refinement, possibly higher-fidelity continent
  shapes) is expected before any real catalog entry is created.
- Durations are implemented as fixed `setTimeout` phases tuned to match the
  requested target durations (3s / 4s / 5s); they are not derived from the
  CSS animation timings themselves, so changing a CSS `animation-duration`
  without also updating the corresponding duration constant could cause
  drift between the visual end and the `onComplete` callback.
- The preview page does not include an automated "all three Coin tiers
  side-by-side on a phone" screenshot in CI — this was checked manually by
  resizing the dev server viewport; there is no new visual regression test
  for pixel-level mobile rendering.
- No backend changes were made at all: there is no new `GiftCatalog` entry,
  no pricing endpoint, and no way to actually send these gifts in a live
  stream. Wiring them into the real catalog/sending flow is explicitly out
  of scope for this PR.
- The `VERCEL_ENV`-based branch in `resolveGiftAnimationsPreviewAccess` was
  verified with unit tests passing explicit env values (it does not rely on
  an actual Vercel deployment during this review), since this sandbox has
  no access to a live Vercel Preview environment.

## Follow-up fix: Vercel Preview visibility (this update)

The initial version gated the route purely on
`process.env.NODE_ENV !== "production"`. Vercel Preview deployments build
with `NODE_ENV=production` as well, so that check also hid the preview
from legitimate Preview deployments — the opposite of what a preview
route is for. This was corrected by:
- Moving the gate into a Server Component (`page.jsx` is no longer
  `"use client"`) so server-only env vars (`VERCEL_ENV`, the new opt-in
  flag) are never bundled to the client.
- Adding `frontend/lib/giftAnimationsPreviewAccess.js`, which distinguishes
  Vercel Production (always disabled, flag ignored) from Vercel Preview
  (enabled only with an explicit opt-in) from everything else (previous
  `NODE_ENV` behavior, unchanged).
- Extracting the interactive UI into
  `GiftAnimationsPreviewClient.jsx`, mounted only once the gate passes.
- The three animated components, their proposed Coin values (300 / 800 /
  8,000) and target durations (3s / 4s / 5s) were **not** touched.
