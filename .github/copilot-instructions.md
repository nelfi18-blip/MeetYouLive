# Copilot Instructions for MeetYouLive

## Project overview

MeetYouLive is a live-streaming platform with a Node.js/Express backend and a Next.js 15 frontend. The frontend is deployed on Vercel and the backend is deployed on Render.

## Repository structure

```
MeetYouLive/
├── backend/           Node.js + Express API (CommonJS)
│   ├── index.js           Entry point (loads .env, connects to MongoDB, starts server)
│   └── src/
│       ├── app.js         Express app setup (Helmet, CORS, routes)
│       ├── config/        db.js, passport.js
│       ├── controllers/   Route handler logic
│       ├── middlewares/   auth.middleware.js (JWT), admin.middleware.js,
│       │                  creator.middleware.js, upload.middleware.js (Multer)
│       ├── models/        Mongoose models
│       ├── routes/        Express routers
│       ├── services/      Business logic helpers (agency.service.js, notification.service.js, …)
│       └── lib/           socket.js (Socket.io server singleton)
└── frontend/          Next.js 15 App Router (JSX, no TypeScript)
    ├── app/
    │   ├── layout.jsx     Root layout (Providers, Navbar, metadata)
    │   ├── page.jsx       Home page
    │   ├── providers.jsx  NextAuth SessionProvider wrapper
    │   ├── globals.css    Global styles
    │   ├── api/auth/[...nextauth]/route.js  NextAuth handler
    │   └── <route>/       One folder per page route
    ├── components/        Shared UI components (Navbar, GiftPanel, LiveCard, …)
    ├── contexts/          React context providers
    ├── lib/               Shared helpers (authOptions.js, creatorUtils.js, commission.js, …)
    ├── messages/          i18n JSON files (en.json, es.json, pt.json)
    └── next.config.mjs    Next.js configuration
```

## Tech stack

| Layer     | Technology                                                              |
|-----------|-------------------------------------------------------------------------|
| Backend   | Node.js 24, Express, Mongoose, JWT, Passport (Google OAuth), Stripe, Socket.io, Firebase Admin, Multer, Helmet, express-rate-limit |
| Frontend  | Next.js 15, React 18, NextAuth.js v4, Socket.io-client, Agora RTC SDK  |
| Database  | MongoDB Atlas                                                           |
| Deploy    | Frontend → Vercel, Backend → Render                                     |

## Running the project

```bash
# Backend (from repo root)
cd backend && npm install && npm start       # production
# (no test runner is configured; use npm run test:db to check DB connectivity)

# Frontend (from repo root)
cd frontend && npm install && npm run dev    # development server on :3000
cd frontend && npm run build                # production build (validates JSX/errors)
```

## Key conventions

### Backend
- **CommonJS only** — use `require`/`module.exports`. Never use ES Module `import`/`export` in the backend.
- **Middleware order in routes**: `verifyToken` → (optional) `requireAdmin` or `requireApprovedCreator` → route handler. Always put `verifyToken` first.
  - `verifyToken` — sets `req.userId` (string), returns 401/403 on invalid/blocked tokens.
  - `optionalVerifyToken` — sets `req.userId` if a valid Bearer token is present, but never rejects the request (use for public endpoints that optionally personalize content).
  - `requireAdmin` — requires `role === "admin"` (use after `verifyToken`).
  - `requireApprovedCreator` — requires `role === "creator"` **and** `creatorStatus === "approved"` (use after `verifyToken`).
  - `upload` (Multer) — handles image file uploads to `backend/uploads/`. Allowed types: JPEG, PNG, WebP, GIF; max 5 MB. Must run after `verifyToken` because the filename includes `req.userId`.
- **Rate limiting** — apply `express-rate-limit` on sensitive endpoints (auth, payments). Import it from `"express-rate-limit"` in the route file.
- **Error responses** — return `{ message: "..." }` for simple errors or `{ ok: false, message: "..." }` when the route already uses `ok: true` on success.
- **Mongoose** — always call `mongoose.Schema` with a `_id: false` option on embedded sub-schemas. Use `.select()` to limit fields returned from queries. Fire-and-forget background DB writes (e.g. updating `lastActiveAt`) with `.catch(() => {})` so they never break the request.
- **Coins / virtual currency** — the in-app currency is called *coins*. Balance fields on User are `coinsBalance` (spending wallet) and `earningsCoins` (creator payout wallet). All coin transfers must create a `CoinTransaction` document via the coins service. Never decrement a balance without first verifying sufficient funds atomically.
- **Agency commission split** — before applying a commission split, always verify the `AgencyRelationship` has both `status: "active"` AND `subCreatorAgreed: true`. The split helper is in `backend/src/services/agency.service.js`.
- **Platform fee** — the platform always takes a fixed 40% cut; agency commission (if any) applies only to the creator's 60% share.
- **Socket.io** — the Socket.io server is a singleton exported from `backend/src/lib/socket.js` as `{ getIO, setLiveEvent, getLiveEvent, … }`. Import `getIO()` in controllers/services when you need to emit events. Never create a second `Server` instance.
- **Notifications** — use `createNotification` / `createBulkNotifications` from `backend/src/services/notification.service.js` to create in-app notifications. These helpers also emit the `NEW_NOTIFICATION` socket event to the target user's room automatically.
- **File serving** — uploaded files are served under `/uploads/*` by Express's static middleware (set up in `app.js`). Store only the relative path (e.g. `uploads/avatar-<userId>-<ts>.jpg`) in the database.
- **Security** — Helmet.js is configured in `app.js` before CORS with `contentSecurityPolicy defaultSrc:'none'` and `crossOriginResourcePolicy: cross-origin`. Do not remove or weaken these headers.

### Frontend
- **Environment variables** — public vars are prefixed `NEXT_PUBLIC_` and safe to use in client components. Server-only vars (`NEXTAUTH_SECRET`, `GOOGLE_CLIENT_SECRET`, `INTERNAL_API_SECRET`) must never be exposed to the client.
- **"use client"** — add `"use client"` at the top of any component that uses React hooks (`useState`, `useEffect`, etc.), browser APIs, or NextAuth's `useSession`. Omit it for purely static/server-rendered pages.
- **NextAuth session** — access the session with `useSession()` (client) or `getServerSession(authOptions)` (server). The backend JWT is in `session.backendToken`; always send it as `Authorization: Bearer <token>` when calling the backend API.
- **Backend API calls** — use `process.env.NEXT_PUBLIC_API_URL` as the base URL. Never hardcode backend URLs.
- **Approved creator check** — use the `isApprovedCreator(user)` helper from `frontend/lib/creatorUtils.js` (requires both `role === "creator"` and `creatorStatus === "approved"`). Do not inline this check.
- **Commission display** — use `calcSplit` from `frontend/lib/commission.js` when showing earnings splits in the UI.
- **i18n** — translation strings live in `frontend/messages/{en,es,pt}.json`. Keep all three files in sync when adding new strings.
- **Routing** — add new pages as `frontend/app/<route>/page.jsx`. Use Next.js's `Link` component for internal navigation.
- **Socket.io (client)** — the shared socket helper is in `frontend/lib/socket.js`. Import it to get a singleton socket connected to `NEXT_PUBLIC_API_URL`. Listen for real-time events (e.g. `NEW_NOTIFICATION`, `LIVE_EVENT_STARTED`) inside `useEffect` with proper cleanup.

## Adding a new feature (common pattern)

1. **Backend model** — add a Mongoose model in `backend/src/models/`.
2. **Backend route + controller** — add a route file in `routes/` and a controller in `controllers/`, then register the route in `src/app.js` with `app.use("/api/<name>", <name>Routes)`.
3. **Frontend page** — add `frontend/app/<route>/page.jsx` (and `"use client"` if interactive).
4. **Real-time** — if the feature needs live updates, emit from the controller/service via `getIO().to(room).emit(EVENT, payload)` and listen in the frontend component.

## Environment variables

### Backend
| Variable                       | Description                                                                        |
|--------------------------------|------------------------------------------------------------------------------------|
| `PORT`                         | Server port (default 10000)                                                        |
| `MONGO_URI`                    | MongoDB Atlas connection string                                                    |
| `JWT_SECRET`                   | Secret for signing JWT tokens                                                      |
| `GOOGLE_CLIENT_ID`             | Google OAuth client ID                                                             |
| `GOOGLE_CLIENT_SECRET`         | Google OAuth client secret                                                         |
| `GOOGLE_CALLBACK_URL`          | OAuth callback URL                                                                 |
| `FRONTEND_URL`                 | Production frontend URL (for CORS)                                                 |
| `STRIPE_SECRET_KEY`            | Stripe secret key                                                                  |
| `STRIPE_WEBHOOK_SECRET`        | Stripe webhook signing secret                                                      |
| `STRIPE_SUBSCRIPTION_PRICE_ID` | Stripe Price ID for the subscription plan                                          |
| `NEXTAUTH_SECRET`              | Shared secret verified via `x-nextauth-secret` header on `/api/auth/google-session` |
| `INTERNAL_API_SECRET`          | Secret verified via `x-internal-api-secret` header for server-to-server calls     |

### Frontend
| Variable                        | Description                                                 |
|---------------------------------|-------------------------------------------------------------|
| `NEXT_PUBLIC_API_URL`           | Backend API base URL                                        |
| `NEXT_PUBLIC_LIVE_PROVIDER_KEY` | Live streaming provider API key                             |
| `GOOGLE_CLIENT_ID`              | Google OAuth client ID (used by NextAuth)                   |
| `GOOGLE_CLIENT_SECRET`          | Google OAuth client secret (used by NextAuth)               |
| `NEXTAUTH_SECRET`               | NextAuth signing/encryption secret                          |
| `NEXTAUTH_URL`                  | Canonical URL of the frontend (for NextAuth)                |
| `INTERNAL_API_SECRET`           | Server-side secret for backend-token refresh calls          |
