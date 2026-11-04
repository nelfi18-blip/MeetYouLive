# MeetYouLive — Frontend

Next.js 15 (App Router) frontend with React 18 for MeetYouLive; Vercel is the deployment target.
Node.js 24 is required. Capacitor 7 iOS/Android shells load the web app through
`server.url`; actual deployment and store availability are separate checks.

## Tech stack

- **Framework**: Next.js 15 (App Router, JSX)
- **Auth**: NextAuth.js v4 (web Google OAuth), backend JWT sessions, native Google browser handoff and iOS-only Sign in with Apple plugin
- **Realtime**: Socket.io client (live notifications)
- **Video**: Agora RTC SDK (live streaming and private calls)
- **Payments**: Stripe on web; Google Play Billing on native Android; StoreKit 2 on native iOS with the AppleIAP plugin. Native shells block external Stripe Checkout.
- **Status**: adapters/plugins are implemented; automated tests do not verify live store products, credentials, purchases or approval. See [Apple IAP](../docs/APPLE_IAP_SETUP.md), [Google Play](../docs/GOOGLE_PLAY_BILLING_SETUP.md) and [iOS build evidence](../docs/ios-testflight-signing.md).

## Local development

```bash
cp .env.example .env.local
# Fill in your values (see table below)
npm ci
npm run dev
```

App runs at [http://localhost:3000](http://localhost:3000).

## Environment variables

| Variable                      | Description                                             |
|-------------------------------|---------------------------------------------------------|
| `NEXTAUTH_URL`                | Canonical URL of the frontend (e.g. `http://localhost:3000`) |
| `NEXTAUTH_SECRET`             | Secret used by NextAuth to sign session cookies         |
| `INTERNAL_API_SECRET`         | Shared secret for backend `/api/auth/google-session` call |
| `API_URL`                    | Optional server-side backend URL override; set together with the public API URL for isolated testing |
| `NEXT_PUBLIC_API_URL`         | Backend API base URL (`https://meetyoulive.onrender.com`) |
| `NEXT_PUBLIC_AGORA_APP_ID`    | Agora App ID (exposed to browser for RTC SDK)           |
| `GOOGLE_CLIENT_ID`            | Google OAuth client ID (used by NextAuth)               |
| `GOOGLE_CLIENT_SECRET`        | Google OAuth client secret (used by NextAuth)           |

## Key routes

| Path | Description |
|------|-------------|
| `/` | Home / landing |
| `/login` | Email login + Google OAuth |
| `/register` | Registration |
| `/dashboard` | User dashboard |
| `/explore` | Discovery hub |
| `/feed` | Social discovery feed |
| `/live` | Live stream discovery |
| `/live/[id]` | Live stream room (Agora RTC) |
| `/live/start` | Start a live stream (creators only) |
| `/call/[id]` | Private video call room |
| `/creator` | Creator dashboard (earnings, payouts, settings) |
| `/creator/content` | Manage exclusive content |
| `/exclusive` | Browse exclusive content |
| `/agency` | Agency panel (sub-creator management) |
| `/wallet` | Coin balance and transaction history |
| `/coins` | MYL Coins packages; provider selected by platform |
| `/payment/success`, `/payment/cancel` | Web checkout return pages |
| `/profile` | User profile |
| `/settings` | Session actions and account deletion |
| `/matches` | Match list |
| `/chats` | Direct messages |
| `/admin` | Admin panel |

## Deploy on Vercel

1. Import the repo in [Vercel](https://vercel.com) and set the **Root Directory** to `frontend`.
2. Set the environment variables listed above.
3. Add `meetyoulive.net` and `www.meetyoulive.net` in **Project → Settings → Domains**.
4. Set `meetyoulive.net` as the primary domain; `www.meetyoulive.net` must redirect to it.

## Verified checks (2026-11-04)

[Main CI at `4754ff0a`](https://github.com/nelfi18-blip/MeetYouLive/actions/runs/41900992217)
passed lint, **700 tests in 67 files**, and the Next.js build:

```bash
node --test --test-concurrency=1 tests/*.test.mjs
npm run lint
npm run build
```

CI uses the complete glob, including tests outside individual npm scripts. The
backend integration job currently verifies **43** real-MongoDB cases (29 before
#1129); see [root CI documentation](../README.md#ci-and-reproducible-checks).
These tests do not prove a physical iPhone/Android purchase or Apple/Google approval.

For isolated previews, explicitly set both `NEXT_PUBLIC_API_URL` and `API_URL`
at build time; committed production defaults and Capacitor's web URL do not
establish an isolated backend/database. Do not use customer accounts for acceptance tests.
The code's canonical web host is `meetyoulive.net`; Capacitor defaults to
`https://www.meetyoulive.net`. Verify actual hosting redirects instead of assuming
the code or this setup checklist confirms DNS configuration.
