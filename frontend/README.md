# MeetYouLive — Frontend

Next.js 15 (App Router) frontend for the MeetYouLive platform, deployed on Vercel.

## Tech stack

- **Framework**: Next.js 15 (App Router, JSX)
- **Auth**: NextAuth.js v4 (Google OAuth + backend JWT)
- **Realtime**: Socket.io client (live notifications)
- **Video**: Agora RTC SDK (live streaming and private calls)
- **Payments**: Stripe (via backend API)

## Local development

```bash
cp .env.example .env.local
# Fill in your values (see table below)
npm install
npm run dev
```

App runs at [http://localhost:3000](http://localhost:3000).

## Environment variables

| Variable                      | Description                                             |
|-------------------------------|---------------------------------------------------------|
| `NEXTAUTH_URL`                | Canonical URL of the frontend (e.g. `http://localhost:3000`) |
| `NEXTAUTH_SECRET`             | Secret used by NextAuth to sign session cookies         |
| `INTERNAL_API_SECRET`         | Shared secret for backend `/api/auth/google-session` call |
| `NEXT_PUBLIC_API_URL`         | Backend API base URL (e.g. `https://api.meetyoulive.net`) |
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
| `/explore` | Live streams + user discovery |
| `/live/[id]` | Live stream room (Agora RTC) |
| `/live/start` | Start a live stream (creators only) |
| `/call/[id]` | Private video call room |
| `/creator` | Creator dashboard (earnings, payouts, settings) |
| `/creator/content` | Manage exclusive content |
| `/exclusive` | Browse exclusive content |
| `/agency` | Agency panel (sub-creator management) |
| `/wallet` | Coin balance and transaction history |
| `/payment` | Purchase MYL Coins (Stripe) |
| `/profile` | User profile settings |
| `/matches` | Match list |
| `/chats` | Direct messages |
| `/admin` | Admin panel |

## Deploy on Vercel

1. Import the repo in [Vercel](https://vercel.com) and set the **Root Directory** to `frontend`.
2. Set the environment variables listed above.
3. Add `meetyoulive.net` and `www.meetyoulive.net` in **Project → Settings → Domains**.
