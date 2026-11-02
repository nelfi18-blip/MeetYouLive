# MYL World & Beyond — Gift Animations Preview (dev-only)

Status: **preview only, not monetized, not in the active catalog.**

This document describes all twelve animated gift concepts for the future
"MYL World & Beyond" collection, the isolated preview route created to
review them, and the known limitations of the current implementation.

## What was built

Twelve original, hand-authored SVG + CSS animations (no emoji stand-ins, no
3D engine, no video/GIF assets), organized into three visual-intensity
tiers that scale animation length, particle density and finale drama with
the proposed Coin value:

| Gift | Proposed Coins | Target duration | Tier |
|---|---|---|---|
| 🦋 Mariposa luminosa | 20 | 2.2s | Basic |
| 🐬 Delfín de cristal | 80 | 2.6s | Basic |
| 🌹 Rosa holográfica | 150 | 2.4s | Basic |
| 🗼 Torre Eiffel mágica | 300 | 3s | Premium |
| ⛩️ Portal de Japón | 500 | 3.5s | Premium |
| 🚀 Nave exploradora | 800 | 4s | Premium |
| 🔺 Pirámide encantada | 1,200 | 3.8s | Premium |
| 🏰 Castillo celestial | 2,000 | 4.5s | Super |
| 🧱 Gran Muralla de luz | 3,000 | 5s | Super |
| 🌌 Galaxia MYL | 5,000 | 5.2s | Super |
| 🌍 Planeta conectado | 8,000 | 5s | Super |
| ✈️ Vuelta al Mundo | 15,000 | 6s | Super |

Components (`frontend/components/gifts/previews/`):
- `LuminousButterflyGiftPreview.jsx` — Basic tier. A glowing butterfly
  with four wing panels that flap via `rotateY`, drifting along a gentle
  S-curve flight path while trailing soft luminous dust motes.
- `CrystalDolphinGiftPreview.jsx` — Basic tier. A translucent, glass-like
  dolphin silhouette leaps through a shallow arc and splashes a burst of
  crystalline droplets at the apex of its leap.
- `HolographicRoseGiftPreview.jsx` — Basic tier. A layered rose silhouette
  whose petals unfold ring by ring in an iridescent, continuously
  hue-shifting holographic gradient, with prismatic sparkle highlights.
- `EiffelTowerGiftPreview.jsx` — Premium tier. A recognizable three-tiered
  Eiffel Tower silhouette (antenna, upper tier, platform ledges, splayed
  lattice legs with cross-bracing) is drawn progressively via an SVG
  `stroke-dasharray` reveal, then its platforms/lattice fade in, then it
  lights up gold with a pulsing ambient glow, a bottom-to-top string of
  blinking lamps, a blinking beacon at the tip, golden sparkle flares, and
  one gentle `rotateY` tilt.
- `JapanPortalGiftPreview.jsx` — Premium tier. A red torii gate is drawn
  progressively via a stroke sweep, then its lacquered red/orange gradient
  and two paper lanterns glow warmly while sakura petals drift down
  through the gate.
- `ExplorerShipGiftPreview.jsx` — Premium tier. A higher-detail futuristic
  ship (dual-gradient hull with a top specular highlight for volume, glass
  cockpit dome with a reflection highlight, wing fins, visible engine
  nacelles) performs a quick warp-in entrance, banks gently while flying
  across the stage leaving a two-layer luminous trail with flickering main
  and twin side-thruster flares, then warps back out off the right edge.
- `EnchantedPyramidGiftPreview.jsx` — Premium tier. A three-faced pyramid
  (lit + shadow faces for depth) rises from drifting desert sand, glowing
  hieroglyph-style lines flicker to life on its faces, and a beam of
  mystical light shoots from the apex into the sky.
- `CelestialCastleGiftPreview.jsx` — Super tier. A layered castle
  silhouette (twin outer towers, central keep, gate) rises out of drifting
  clouds against a starfield, its windows light up one by one, and the
  scene closes with a radiant halo bloom behind the central tower.
- `GreatWallOfLightGiftPreview.jsx` — Super tier. A winding, crenellated
  wall with two watchtowers climbs across stylized hills, drawn
  progressively; once built, a wave of golden light sweeps segment by
  segment across the crenellations, then a full-length luminous beam
  sweeps across the whole wall as a finale.
- `MylGalaxyGiftPreview.jsx` — Super tier. A spiral galaxy of stars along
  three curved arms slowly rotates around a pulsing bright core, the
  letters "MYL" glow into formation at the center, and the scene closes
  with a finale burst of star particles radiating outward.
- `ConnectedPlanetGiftPreview.jsx` — Super tier: a spinning globe with
  stylized continents, polar ice caps, a day/night shading terminator and
  drifting cloud wisps for volume, connection nodes with a traveling light
  "packet" animating along each glowing arc, then a cosmic finale where
  the globe blooms brighter, multiple colored burst rings and radiating
  light rays sweep outward, and the whole scene closes with a graceful
  fade.
- `AroundTheWorldGiftPreview.jsx` — Super tier, the grand finale/
  highest-priced gift: a spinning globe with a small plane icon circling
  it along a dashed flight path, leaving a luminous ribbon trail that
  wraps the entire globe; once the orbit completes, the scene erupts into
  a four-ring, multi-color firework finale with radiating light rays
  before a graceful cinematic fade.

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
lists all twelve concepts with their proposed Coin values, tiers and
durations. It is explicitly **not** wired into `frontend/lib/gifts.js`,
the backend `GiftCatalog`/`Gift` models, or any send/purchase flow.

## Where to see it

`frontend/app/dev/gift-animations-preview/` (route: `/dev/gift-animations-preview`):
- `layout.jsx` — sets `robots: { index: false, follow: false }` metadata,
  mirroring `frontend/app/admin/layout.jsx`.
- `page.jsx` — a **Server Component** that only decides whether to render
  the preview at all (see "How it stays protected" below); it never ships
  any interactive code itself.
- `GiftAnimationsPreviewClient.jsx` — the actual interactive UI (all
  twelve preview cards, grouped by tier, each with its own independent
  "Replay" button so a single gift can be reviewed/repeated without
  reloading the page or restarting the others). Only ever mounted once
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

- `npm run lint` (ESLint, `--max-warnings=0`) — clean, including all nine
  newly added components and the rewritten catalog file.
- `npm run build` (`next build`) — compiles successfully; the route
  `/dev/gift-animations-preview` and `/live/[id]` (which also renders the
  same catalog in the creator-only demo panel) both appear in the build
  output.
- `node --test tests/gift-animations-preview.test.mjs` — 60 focused tests
  covering: route protection (`isProtectedRoutePath`,
  `shouldRedirectUnauthenticatedToLogin`), middleware noindex tagging,
  layout robots metadata, that `page.jsx` is a Server Component gating via
  `isGiftAnimationsPreviewEnabled`, the full `resolveGiftAnimationsPreviewAccess`
  decision matrix (Production always disabled even with the flag set,
  Preview requires the explicit flag, non-Vercel builds keep the previous
  `NODE_ENV` behavior, unrecognized production-like builds fail safe), that
  the opt-in env var is never `NEXT_PUBLIC_`-prefixed, absence of any
  network/purchase/Coins API usage across the page/client/catalog for
  **all twelve** components, each component's declared duration constant,
  per-component timer cleanup, `prefers-reduced-motion` support, the
  mobile breakpoint, and that the catalog contains exactly the 12 expected
  ids with their proposed Coin values.
- `node --test tests/myl-world-beyond-live-integration.test.mjs` — updated
  so the "stable animation ids" assertion covers all 12 catalog entries
  (guards against accidentally renaming/removing an id that the Live room
  demo panel or any future commercial wiring would depend on).
- `node --test tests/i18n-key-parity.test.mjs` — confirms `en`/`es`/`pt`
  expose the exact same `giftAnimationsPreview.items.*` keys for all 12
  gifts (no missing/mismatched translation per locale).
- Full existing frontend test suite (`node --test tests/*.test.mjs`)
  re-run: 661/668 passing. The same 7 failures (AUP sections, login adult
  restriction, discovery layout, mobile header, live hero-actions ×2,
  profile gallery) were confirmed present on the base `main` branch before
  this change via `git stash`/`git stash pop` — they are pre-existing and
  unrelated to this work, not introduced by it.
- Verified via `curl` against a local dev server
  (`GIFT_ANIMATIONS_PREVIEW_ENABLED=true NODE_ENV=development npm run dev`)
  that `/dev/gift-animations-preview` still correctly 307-redirects an
  unauthenticated request to `/login?callbackUrl=...` and still carries
  `X-Robots-Tag: noindex, nofollow` — confirming the existing protection
  layers were not weakened by this change.
- Confirmed no Coins balance, catalog, Stripe, Agora, Socket.io, or
  authentication code paths were touched.
- **Not completed in this session**: an authenticated, logged-in
  screenshot/visual walkthrough of all 12 animations rendering in the
  browser (blocked by not having a test account/session available in this
  sandbox to pass the route's auth gate). The automated component-contract
  tests (duration, cleanup, reduced-motion, mobile breakpoint, no network
  calls) and the successful production build are the evidence available
  for this PR; a manual pass by a logged-in reviewer on the deployed
  Preview URL is still recommended before calling any of the 9 new
  animations visually approved, per the explicit instruction not to
  declare unverified animations as visually approved.

## Known limitations

- These are **concept/preview** animations meant to validate direction and
  pacing, not final production-ready art assets. A design pass (exact
  color grading, icon refinement, possibly higher-fidelity continent/city
  shapes) is expected before any real catalog entry is created.
- Durations are implemented as fixed `setTimeout` phases tuned to match
  each gift's target duration; they are not derived from the CSS animation
  timings themselves, so changing a CSS `animation-duration` without also
  updating the corresponding duration constant could cause drift between
  the visual end and the `onComplete` callback.
- The preview page does not include an automated "all twelve gifts
  side-by-side on a phone" screenshot in CI — mobile sizing was checked
  via the component-level `max-width: 480px` CSS rule and unit tests, not
  a pixel-level visual regression test.
- **No backend or commercial wiring was created at all**: there is no new
  `GiftCatalog`/`Gift` document for any of the 12 gifts, no pricing
  endpoint, no Socket.io gift-send event, and no way to actually send any
  of these gifts (or spend/charge Coins) in a live stream. The 15 proposed
  prices are **display-only values inside the preview catalog** and are
  **not approved for billing** — see "Pending for commercial activation"
  below.
- The `VERCEL_ENV`-based branch in `resolveGiftAnimationsPreviewAccess` was
  verified with unit tests passing explicit env values (it does not rely
  on an actual Vercel deployment during this review), since this sandbox
  has no access to a live Vercel Preview environment.
- The Connected Planet's traveling connection "packet", and the Around the
  World plane's ribbon trail, both use the CSS `offset-path`/
  `offset-distance` motion-path properties (supported in current Chrome/
  Edge/Firefox and Safari 16+). On older browsers without support, the
  moving dot/plane simply stays invisible at its default, non-animated
  position — the surrounding arcs/orbit path and glow effects still render
  normally, so the concept remains legible even in that fallback case.
- No screen-recording tool was available in this sandbox to capture a
  video of the full animation sequences, and no authenticated session was
  available to walk through the live `/dev/gift-animations-preview` route
  in a browser; validation for the 9 new animations relies on the
  automated component-contract test suite, ESLint, and a successful
  production build. A manual, logged-in visual pass is recommended before
  treating any of the 9 new animations as visually final.

## Pending for commercial activation (not done in this PR)

Per the explicit protections for this phase, none of the following were
touched and all remain required before any of the 12 gifts could be sent
and billed for real:

1. **Pricing approval** — the 12 proposed Coin values in this document are
   provisional and have **not** been approved for billing. A separate,
   explicit pricing-approval step is required before any value is used to
   charge a user.
2. **Backend `GiftCatalog`/`Gift` entries** — none of the 12 gifts exist as
   documents in the real gift catalog collection; they must be added
   (with final, approved prices) before they can be purchased.
3. **Send flow wiring** — the real gift-send flow (balance check +
   atomic Coins debit, `CoinTransaction` record creation, creator
   `earningsCoins` credit, agency commission split where applicable, the
   40% platform fee) is untouched; these preview components have no
   Coins/balance logic at all.
4. **Socket.io event** — no real-time "gift sent" event/payload was added
   for any of these 12 ids; the existing gift-send socket event and
   payload shape are unchanged.
5. **Commercial catalog UI** — the real in-stream gift picker/panel (the
   one used during an actual live gift send, as opposed to the creator-
   only demo panel) does not show any of these 12 items yet.
6. **Asset/perf pass for production** — a final check of render cost
   during an active Live session (CPU/GPU budget, number of simultaneous
   gift animations, mobile battery impact) should be repeated once these
   are wired into the real send flow, since the preview review here was
   done gift-by-gift in isolation, not under concurrent Live load.
7. **QA sign-off** — a manual, logged-in visual review of all 12
   animations (see "Known limitations" above) is still pending; only
   automated contract tests were able to run in this sandbox.

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

## Visual polish pass: cinematic upgrade (this update)

All three animations were redrawn for a more premium, cinematic look while
keeping the same `onComplete` contract, duration constants (3s / 4s / 5s),
proposed Coin values, and existing protection layers untouched. No new
animation was created from scratch — all three improve the existing
concepts.

- **`EiffelTowerGiftPreview.jsx`** — replaced the generic tapered-spire
  silhouette with a real three-tier Eiffel Tower profile (splayed arch
  legs, two platform ledges, a tapering mast and antenna), measured so the
  `stroke-dasharray` reveal (≈459 units) draws the whole silhouette evenly.
  Added a new `assembled` phase: the platform ledges and lattice
  cross-bracing fade in right after the outline finishes, before the
  golden "lit" phase. Replaced the single top beacon-only lighting with a
  string of 7 lamps that blink on bottom-to-top across the three tiers in
  addition to the beacon, for a stronger "landmark lighting up at dusk"
  read.
- **`ExplorerShipGiftPreview.jsx`** — redrew the hull with a dual-gradient
  body plus a topside specular-highlight overlay for real volume (instead
  of a flat single-gradient silhouette), a glass cockpit dome with its own
  reflection highlight, and two visible engine nacelles. Added a main
  engine flare and two independently flickering side-thruster flares.
  Replaced the single CSS-gradient trail with a two-layer trail (soft
  blurred outer glow + a crisp bright inner core) and added a quick
  warp-in/warp-out scale-stretch at entrance/exit plus a gentle bank
  (rotate) through the flight arc, to read as clearly higher-impact than
  the Eiffel Tower tier.
- **`ConnectedPlanetGiftPreview.jsx`** — added a day/night shading
  terminator (clipped radial/linear overlay) and slowly drifting cloud
  wisps on top of the existing continents for a real sense of spherical
  volume, plus small polar ice caps for extra "real planet" recognition.
  Each connection arc now has glowing endpoint nodes and a small light
  "packet" that travels along the arc (CSS motion path, degrades
  gracefully to a static glow on browsers without `offset-path` support)
  instead of only a pulsing stroke. The cosmic finale was expanded from two
  burst rings to three color-staggered rings plus ten radiating light rays
  and a brightness "bloom" on the globe itself just before the graceful
  close, to make the legendary tier unmistakably bigger than the other two.
- All changes were validated with hand-authored static HTML/SVG mockups
  rendered via headless Chromium (`chromium --headless --screenshot=...`)
  during development to sanity-check the Eiffel Tower silhouette and the
  ship's hull volume/shading at both desktop and mobile widths before
  porting the final markup into the React components. No live screen
  recording tool was available in this sandbox, so a recording of the full
  animation sequences could not be produced; static frame screenshots were
  used instead to validate shape recognizability and lighting.
- Re-ran `npm run lint`, `npm run build`, the focused
  `tests/gift-animations-preview.test.mjs` suite (24/24 passing, unchanged
  assertions about durations, timer cleanup, `onComplete`,
  `prefers-reduced-motion`, the `max-width: 480px` breakpoint, and absence
  of network/purchase/Coins calls), and the full `tests/*.test.mjs` suite
  (same 4 pre-existing, unrelated failures as before — no new failures).

## Collection completion: 3 → 12 gifts (this update)

The original 3-gift preview (Eiffel Tower, Explorer Ship, Connected
Planet) is now extended to the complete, originally proposed 12-gift "MYL
World & Beyond" collection. All 3 original animations, their duration
constants and their proposed Coin values are **unchanged**; 9 new
components were added following the same architecture and contract.

- Introduced a new three-tier scheme — `basic` / `premium` / `super` —
  replacing the previous `medium` / `premium` / `legendary` scheme that
  only had to describe 3 gifts. Visual intensity (duration, particle
  count, finale complexity) scales with tier: Basic gifts are short, light
  single-motif animations; Premium gifts add a multi-phase build-and-light
  sequence; Super gifts are the longest, with multi-stage finales (burst
  rings, radiating rays, sweeping light waves).
- Added `LuminousButterflyGiftPreview.jsx`, `CrystalDolphinGiftPreview.jsx`
  and `HolographicRoseGiftPreview.jsx` (Basic tier, 20/80/150 Coins).
- Added `JapanPortalGiftPreview.jsx` and `EnchantedPyramidGiftPreview.jsx`
  (Premium tier, 500/1,200 Coins), joining the existing Eiffel Tower and
  Explorer Ship Premium-tier gifts.
- Added `CelestialCastleGiftPreview.jsx`, `GreatWallOfLightGiftPreview.jsx`,
  `MylGalaxyGiftPreview.jsx` and `AroundTheWorldGiftPreview.jsx` (Super
  tier, 2,000/3,000/5,000/15,000 Coins), joining the existing Connected
  Planet Super-tier gift.
- Rewrote `frontend/lib/giftAnimationsPreviewCatalog.js` to list all 12
  gifts (in ascending-price/tier order) and updated the `tierKey` of the 3
  pre-existing entries to the new scheme (`eiffel-tower` and
  `explorer-ship` → `premium`, `connected-planet` → `super`). The catalog
  shape (`id`, `icon`, `Component`, `durationMs`, `proposedCoins`,
  `tierKey`, `nameKey`, `descriptionKey`) is unchanged, so both consumers
  (`/dev/gift-animations-preview` and the Live room creator-only demo
  panel) picked up all 9 new gifts automatically, with **no changes
  required** to either `page.jsx`/`GiftAnimationsPreviewClient.jsx` or
  `app/live/[id]/page.jsx` — both already iterate the catalog array
  generically.
- Updated `frontend/messages/{en,es,pt}.json`: replaced the 3-entry tier
  labels with the new Basic/Premium/Super labels (in all 3 languages) and
  added name/description translations for all 9 new gifts, keeping the
  existing translations for the 3 original gifts unchanged. Verified with
  `tests/i18n-key-parity.test.mjs`.
- Expanded `tests/gift-animations-preview.test.mjs` (component list,
  duration/timer/reduced-motion/mobile/no-network assertions now run
  against all 12 components; the catalog test now asserts the exact set
  of 12 ids and Coin values) and
  `tests/myl-world-beyond-live-integration.test.mjs` (stable-id list now
  covers all 12 ids) so future changes to any of the 12 gifts are covered
  by the same regression safety net as the original 3.
- Each of the 9 new components reuses the exact same architecture as the
  original 3: a `phase` state machine driven by `setTimeout`s captured in
  `timersRef.current` and cleared on unmount, a single `onComplete` call,
  a `prefers-reduced-motion` branch that renders the end state
  immediately, a `max-width: 480px` responsive rule, pure inline SVG/CSS
  (no images, no video, no heavy 3D libraries), and zero network/Coins
  code — so they inherit the same protections (dev-only route gate,
  demo-only Live panel gate, no real send/charge path) with no new
  surface area to secure.
- Existing accessibility, i18n and demo-control systems (the "Replay"
  button per card, the `prefers-reduced-motion` handling, the
  `/dev/gift-animations-preview` auth + env + noindex gates, and the Live
  room's `mylWorldBeyondAccess` creator-only demo gate) were reused as-is
  and were **not** modified — only the catalog content and translations
  were expanded.
