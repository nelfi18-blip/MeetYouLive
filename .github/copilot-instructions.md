# Copilot Instructions for MeetYouLive

## Project overview

MeetYouLive is a live-streaming platform with a Node.js/Express backend and a Next.js 15 frontend. The backend is deployed on Vercel as a Node.js serverless function; the frontend is deployed on Vercel as a Next.js app.

## Repository structure

```
MeetYouLive/
├── backend/           Node.js + Express API (CommonJS)
│   ├── index.js           Entry point (connects to MongoDB, starts server)
│   ├── src/
│   │   ├── app.js         Express app setup (CORS, routes)
│   │   ├── config/        db.js, passport.js
│   │   ├── controllers/   Route handler logic
│   │   ├── middlewares/   auth.middleware.js (JWT), admin.middleware.js
│   │   ├── models/        Mongoose models
│   │   ├── routes/        Express routers
│   │   └── services/      Business logic helpers
│   └── vercel.json        Vercel serverless config
└── frontend/          Next.js 15 App Router (JSX, no TypeScript)
    ├── app/
    │   ├── layout.jsx     Root layout (Providers, Navbar)
    │   ├── page.jsx       Root page (redirects to /login)
    │   ├── providers.jsx  NextAuth SessionProvider wrapper
    │   ├── api/auth/      NextAuth API route ([...nextauth])
    │   ├── login/         Login page
    │   ├── register/      Register page
    │   ├── dashboard/     Dashboard page
    │   ├── explore/       Explore page
    │   ├── live/          Live streaming page
    │   ├── profile/       Profile page
    │   ├── chats/         Chats page
    │   ├── coins/         Coins page
    │   └── payment/       Payment page
    ├── components/        Shared UI components (Navbar, InstallPrompt, etc.)
    ├── lib/               Shared helpers (e.g. payVideo.js)
    ├── next.config.mjs
    └── vercel.json        Vercel Next.js config
```

## Tech stack

| Layer     | Technology                                                          |
|-----------|---------------------------------------------------------------------|
| Backend   | Node.js 18, Express, Mongoose, JWT, Passport (Google OAuth), Stripe |
| Frontend  | Next.js 15, React 18, NextAuth v4                                   |
| Database  | MongoDB Atlas                                                       |
| Deploy    | Vercel (both backend and frontend)                                  |

## Key conventions

- **Backend uses CommonJS** (`require`/`module.exports`). Never use `import`/`export` in backend files.
- **Frontend uses ES Modules** with Next.js App Router conventions. Use `import`/`export` in all frontend files.
- **Frontend env vars** that must be accessible in the browser are prefixed with `NEXT_PUBLIC_` and accessed via `process.env.NEXT_PUBLIC_*`. Server-only vars (e.g. `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_SECRET`) have no prefix.
- **Backend env vars** are accessed via `process.env.*` after `dotenv.config()` in `index.js`.
- **Authentication** uses two layers:
  - **NextAuth v4** on the frontend for session management (Google OAuth via `app/api/auth/[...nextauth]`). Access the session with `useSession()` (client) or `getServerSession()` (server).
  - **JWT** on the backend: the `verifyToken` middleware in `middlewares/auth.middleware.js` validates a `Bearer` token sent in the `Authorization` header.
- **Routing** uses Next.js App Router. Add new pages by creating a `page.jsx` inside a new folder under `frontend/app/`. Shared UI goes in `frontend/components/`.
- **CORS** — the backend allows origins listed in `FRONTEND_URL` env var and any `*.vercel.app` domain. When deploying to a custom domain, set `FRONTEND_URL` in the backend environment.

## Adding a new feature (common pattern)

1. **Backend**: add a Mongoose model in `models/`, a route file in `routes/`, a controller in `controllers/`, then register the route in `src/app.js`.
2. **Frontend**: create a new folder under `app/` with a `page.jsx` file. Add shared components to `components/`.

## Environment variables

### Backend
| Variable                       | Description                                  |
|--------------------------------|----------------------------------------------|
| `PORT`                         | Server port (default 10000)                  |
| `MONGO_URI`                    | MongoDB Atlas connection string              |
| `JWT_SECRET`                   | Secret for signing JWT tokens                |
| `GOOGLE_CLIENT_ID`             | Google OAuth client ID                       |
| `GOOGLE_CLIENT_SECRET`         | Google OAuth client secret                   |
| `GOOGLE_CALLBACK_URL`          | OAuth callback URL                           |
| `FRONTEND_URL`                 | Production frontend URL (for CORS)           |
| `STRIPE_SECRET_KEY`            | Stripe secret key                            |
| `STRIPE_WEBHOOK_SECRET`        | Stripe webhook signing secret                |
| `STRIPE_SUBSCRIPTION_PRICE_ID` | Stripe Price ID for the subscription plan    |
| `NEXTAUTH_SECRET`              | Shared secret used to verify NextAuth JWTs   |

### Frontend
| Variable                   | Description                                    |
|----------------------------|------------------------------------------------|
| `NEXT_PUBLIC_API_URL`      | Backend API base URL                           |
| `NEXT_PUBLIC_LIVE_PROVIDER_KEY` | Live streaming provider API key           |
| `GOOGLE_CLIENT_ID`         | Google OAuth client ID (used by NextAuth)      |
| `GOOGLE_CLIENT_SECRET`     | Google OAuth client secret (used by NextAuth)  |
| `NEXTAUTH_SECRET`          | NextAuth session signing secret                |
| `NEXTAUTH_URL`             | Canonical URL of the frontend (for NextAuth)   |
