# Copilot Instructions for MeetYouLive

## Project overview

MeetYouLive is a live-streaming platform with a Node.js/Express backend and a Next.js 15 frontend. The frontend is deployed on Vercel and the backend is deployed on Render.

## Repository structure

```
MeetYouLive/
├── backend/           Node.js + Express API (CommonJS)
│   ├── index.js           Entry point (loads .env, connects to MongoDB, starts server)
│   └── src/
│       ├── app.js         Express app setup (CORS, routes registration)
│       ├── config/
│       │   ├── db.js          MongoDB connection via Mongoose
│       │   └── passport.js    Google OAuth strategy
│       ├── controllers/
│       │   ├── gift.controller.js
│       │   ├── live.controller.js
│       │   ├── payment.controller.js
│       │   ├── subscription.controller.js
│       │   └── video.controller.js
│       ├── middlewares/
│       │   ├── auth.middleware.js   JWT verification (verifyToken)
│       │   └── admin.middleware.js  Admin role check
│       ├── models/
│       │   ├── Gift.js, Live.js, Purchase.js
│       │   ├── Report.js, Subscription.js
│       │   ├── User.js, Video.js
│       └── routes/
│           ├── admin.routes.js, auth.routes.js
│           ├── gift.routes.js, google.routes.js
│           ├── live.routes.js, moderation.routes.js
│           ├── payment.routes.js, subscription.routes.js
│           ├── user.routes.js, webhook.routes.js
└── frontend/          Next.js 15 App Router (JSX, no TypeScript)
    ├── app/
    │   ├── layout.jsx     Root layout (Providers, Navbar, metadata)
    │   ├── page.jsx       Home page
    │   ├── providers.jsx  NextAuth SessionProvider wrapper
    │   ├── globals.css    Global styles
    │   ├── api/auth/[...nextauth]/route.js  NextAuth handler
    │   ├── chats/         Chat page
    │   ├── coins/         Coins purchase page
    │   ├── dashboard/     Creator/user dashboard
    │   ├── explore/       Explore live streams
    │   ├── live/          Live stream viewer
    │   ├── login/         Login page
    │   ├── payment/       Payment/checkout page
    │   ├── profile/       User profile page
    │   └── register/      Registration page
    ├── components/
    │   ├── Navbar.jsx, NavbarWrapper.jsx
    │   ├── BottomNav.jsx, InstallPrompt.jsx, Logo.jsx
    ├── lib/
    │   └── payVideo.js    Video payment helper
    └── next.config.mjs    Next.js configuration
```

## Tech stack

| Layer     | Technology                                                                  |
|-----------|-----------------------------------------------------------------------------|
| Backend   | Node.js 20, Express, Mongoose, JWT, Passport (Google OAuth), Stripe, express-rate-limit |
| Frontend  | Next.js 15, React 18, NextAuth.js v4                                        |
| Database  | MongoDB Atlas                                                               |
| Deploy    | Frontend → Vercel, Backend → Render                                         |

## Key conventions

- **Backend uses CommonJS** (`require`/`module.exports`). Never use ES Module `import`/`export` syntax in the backend.
- **Frontend env vars** are prefixed with `NEXT_PUBLIC_` and accessed via `process.env.NEXT_PUBLIC_*` in client components. Server-only vars (e.g. `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_SECRET`) have no prefix and are never exposed to the client.
- **Backend env vars** are accessed via `process.env.*` after `dotenv.config()` in `backend/index.js`.
- **Authentication** — the frontend uses NextAuth.js (v4) with a Google OAuth provider. On Google sign-in, NextAuth calls the backend `/api/auth/google-session` endpoint and stores the returned JWT as `session.backendToken`. The backend validates requests using the `verifyToken` middleware (`Authorization: Bearer <token>`).
- **Next.js App Router** is used for all routing. Pages are folders under `frontend/app/`. Add new routes by creating a new folder with a `page.jsx` file.
- **CORS** — the backend allows origins listed in `FRONTEND_URL` env var and any `*.vercel.app` domain. When deploying to a custom domain, set `FRONTEND_URL` in the backend environment.
- **Rate limiting** — apply `express-rate-limit` to sensitive API routes (auth, payments) to prevent abuse.
- **Stripe webhooks** — the `/api/webhooks` route is registered *before* `express.json()` so that the raw request body is available for Stripe signature verification.

## Adding a new feature (common pattern)

1. **Backend**: add a Mongoose model in `models/`, a route file in `routes/`, a controller in `controllers/`, then register the route in `src/app.js`.
2. **Frontend**: add a new folder under `frontend/app/` with a `page.jsx` (and `"use client"` if it needs interactivity).

## Development commands

### Backend
```bash
cd backend
npm install          # install dependencies
npm run dev          # start with file watching (node --watch)
npm start            # start production server
```

### Frontend
```bash
cd frontend
npm install          # install dependencies
npm run dev          # start Next.js dev server
npm run build        # production build
npm start            # start production server
```

## Environment variables

### Backend
| Variable                       | Description                                                      |
|--------------------------------|------------------------------------------------------------------|
| `PORT`                         | Server port (default 10000)                                      |
| `MONGO_URI`                    | MongoDB Atlas connection string                                  |
| `JWT_SECRET`                   | Secret for signing JWT tokens                                    |
| `GOOGLE_CLIENT_ID`             | Google OAuth client ID                                           |
| `GOOGLE_CLIENT_SECRET`         | Google OAuth client secret                                       |
| `GOOGLE_CALLBACK_URL`          | OAuth callback URL                                               |
| `FRONTEND_URL`                 | Production frontend URL (for CORS)                               |
| `STRIPE_SECRET_KEY`            | Stripe secret key                                                |
| `STRIPE_WEBHOOK_SECRET`        | Stripe webhook signing secret                                    |
| `STRIPE_SUBSCRIPTION_PRICE_ID` | Stripe Price ID for the subscription plan                        |
| `NEXTAUTH_SECRET`              | Shared secret verified via `x-nextauth-secret` header on `/api/auth/google-session` |

### Frontend
| Variable                        | Description                                   |
|---------------------------------|-----------------------------------------------|
| `NEXT_PUBLIC_API_URL`           | Backend API base URL                          |
| `NEXT_PUBLIC_LIVE_PROVIDER_KEY` | Live streaming provider API key               |
| `GOOGLE_CLIENT_ID`              | Google OAuth client ID (used by NextAuth)     |
| `GOOGLE_CLIENT_SECRET`          | Google OAuth client secret (used by NextAuth) |
| `NEXTAUTH_SECRET`               | NextAuth signing/encryption secret            |
| `NEXTAUTH_URL`                  | Canonical URL of the frontend (for NextAuth)  |
