# Copilot Instructions for MeetYouLive

## Project overview

MeetYouLive is a live-streaming platform with a Node.js/Express backend and a Vite + React frontend. Both are deployed on Vercel (frontend as a static SPA, backend as a Node.js serverless function).

## Repository structure

```
MeetYouLive/
├── backend/           Node.js + Express API (ES Modules)
│   ├── src/
│   │   ├── app.js         Express app setup (CORS, routes)
│   │   ├── server.js      Entry point (connects to MongoDB, starts server)
│   │   ├── config/        db.js, passport.js
│   │   ├── controllers/   Route handler logic
│   │   ├── middlewares/   auth.middleware.js (JWT verification)
│   │   ├── models/        Mongoose models
│   │   ├── routes/        Express routers
│   │   └── services/      Business logic helpers
│   └── vercel.json        Vercel serverless config
└── frontend/          Vite + React SPA (JSX, no TypeScript)
    ├── src/
    │   ├── main.jsx       React entry point
    │   ├── App.jsx        React Router route definitions
    │   ├── pages/         One file per page/route
    │   └── lib/           Shared helpers (e.g. payVideo.js)
    ├── index.html
    ├── vite.config.js
    └── vercel.json        SPA rewrite rule (all paths → index.html)
```

## Tech stack

| Layer     | Technology                              |
|-----------|-----------------------------------------|
| Backend   | Node.js 18, Express, Mongoose, JWT, Passport (Google OAuth), Stripe |
| Frontend  | React 18, Vite, React Router v6         |
| Database  | MongoDB Atlas                           |
| Deploy    | Vercel (both backend and frontend)      |

## Key conventions

- **Backend uses ES Modules** (`"type": "module"` in `package.json`). Always use `import`/`export`, never `require`.
- **Frontend env vars** are prefixed with `VITE_` and accessed via `import.meta.env.VITE_*`. Never use `process.env` in frontend code.
- **Backend env vars** are accessed via `process.env.*` after `dotenv.config()` in `server.js`.
- **Authentication** uses JWT tokens stored in `localStorage`. The token is sent as `Authorization: Bearer <token>` header. The `verifyToken` middleware in `middlewares/auth.middleware.js` validates it.
- **React Router** is used for all client-side navigation. Pages are in `frontend/src/pages/`. Add new routes in `frontend/src/App.jsx`.
- **CORS** — the backend allows origins listed in `FRONTEND_URL` env var and any `*.vercel.app` domain. When deploying to a custom domain, set `FRONTEND_URL` in the backend environment.

## Adding a new feature (common pattern)

1. **Backend**: add a Mongoose model in `models/`, a route file in `routes/`, a controller in `controllers/`, then register the route in `app.js`.
2. **Frontend**: add a page component in `src/pages/`, then add a `<Route>` entry in `src/App.jsx`.

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

### Frontend
| Variable               | Description                            |
|------------------------|----------------------------------------|
| `VITE_API_URL`         | Backend API base URL                   |
| `VITE_LIVE_PROVIDER_KEY` | Live streaming provider API key      |
