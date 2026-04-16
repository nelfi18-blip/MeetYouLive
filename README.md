# MeetYouLive

MeetYouLive is a live streaming and social platform with:

- Next.js frontend deployed on Vercel
- Express backend deployed on Render
- MongoDB Atlas database
- Google authentication
- JWT-based backend session support

## Architecture

### Frontend
- Platform: Vercel
- Directory: `frontend`
- URL: `https://www.meetyoulive.net`

### Backend
- Platform: Render
- Directory: `backend`
- URL: `https://api.meetyoulive.net`

### Database
- MongoDB Atlas

### DNS
- GoDaddy

## Repository structure

```text
MeetYouLive/
├── backend/
│   ├── src/
│   ├── index.js
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── app/
│   ├── public/
│   ├── package.json
│   └── .env.example
├── render.yaml
└── README.md
```

## Features

- ✅ Register / Login (email + password)
- ✅ Google OAuth login (NextAuth.js)
- ✅ Roles: user / creator / admin
- ✅ Creator onboarding and approval flow
- ✅ Live streaming (Agora RTC — host/audience)
- ✅ Gift system with branded catalog and coin deductions
- ✅ MYL Coins (purchase via Stripe, send gifts, unlock content, private calls)
- ✅ Exclusive content (upload, paywall unlock, creator earnings)
- ✅ Private paid video calls (per-minute billing, auto-end on low balance)
- ✅ Creator earnings dashboard and payout requests
- ✅ Agency system (parent creator → sub-creator commission splits)
- ✅ Sparks and Access Passes (boosts, VIP passes)
- ✅ Real-time notifications (Socket.io — live started, gift sent, match, incoming call)
- ✅ Matches and social discovery
- ✅ Chat (direct messages)
- ✅ Stripe payments (one-time coin purchases + subscriptions)
- ✅ Admin panel (moderation, creator approval, gift catalog, agency management)

## Local development

### Backend

```bash
cd backend
cp .env.example .env
# fill in your values
npm install
npm run dev
```

### Frontend

```bash
cd frontend
cp .env.example .env.local
# fill in your values
npm install
npm run dev
```

Frontend runs on [http://localhost:3000](http://localhost:3000) (Next.js default).

## Deployment

### Frontend → Vercel

1. Import the repo in [Vercel](https://vercel.com) and set the **Root Directory** to `frontend`.
2. Set environment variables:
   ```
   NEXTAUTH_URL=https://www.meetyoulive.net
   NEXTAUTH_SECRET=your_nextauth_secret
   INTERNAL_API_SECRET=your_internal_api_secret
   NEXT_PUBLIC_API_URL=https://api.meetyoulive.net
   NEXT_PUBLIC_AGORA_APP_ID=your_agora_app_id
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   ```
3. In **Project → Settings → Domains** add `meetyoulive.net` and `www.meetyoulive.net`.
4. In GoDaddy DNS set:
   - `A` record: `@` → `76.76.21.21`
   - `CNAME` record: `www` → `cname.vercel-dns.com`

### Backend → Render

A `render.yaml` is included so Render can auto-configure the service.

1. Connect the repo in [Render](https://render.com) and set the **Root Directory** to `backend`.
2. Set the secret environment variables in **Environment**:
   ```
   NODE_ENV=production
   PORT=10000
   MONGODB_URI=your_mongodb_uri
   JWT_SECRET=your_jwt_secret
   INTERNAL_API_SECRET=your_internal_api_secret
   FRONTEND_URL=https://www.meetyoulive.net
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   GOOGLE_CALLBACK_URL=https://api.meetyoulive.net/api/auth/google/callback
    AGORA_APP_ID=your_agora_app_id
    AGORA_APP_CERTIFICATE=your_agora_app_certificate
    STRIPE_SECRET_KEY=your_stripe_secret_key
    STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
    STRIPE_SUBSCRIPTION_PRICE_ID=your_stripe_price_id
    SMTP_HOST=your_smtp_host
    SMTP_PORT=587
    SMTP_USER=your_smtp_username
    SMTP_PASS=your_smtp_password
    SMTP_FROM=MeetYouLive <noreply@meetyoulive.net>
    ```
3. In **Settings → Custom Domains** add `api.meetyoulive.net`.
4. In GoDaddy DNS add a `CNAME` record: `api` → `<your-service>.onrender.com`.

### Google OAuth

In [Google Cloud Console](https://console.cloud.google.com) → **OAuth Client**:

- **Authorized Redirect URIs**: `https://www.meetyoulive.net/api/auth/callback/google`
- **Authorized JavaScript origins**: `https://www.meetyoulive.net`

## Environment variables

### Frontend (`frontend/.env.example`)

| Variable                      | Description                                             |
|-------------------------------|---------------------------------------------------------|
| `NEXTAUTH_URL`                | Canonical URL of the frontend                           |
| `NEXTAUTH_SECRET`             | Secret used by NextAuth to sign session cookies         |
| `INTERNAL_API_SECRET`         | Server-to-server secret for `/api/auth/google-session` (`x-internal-api-secret` header) |
| `NEXT_PUBLIC_API_URL`         | Backend API base URL                                    |
| `NEXT_PUBLIC_AGORA_APP_ID`    | Agora App ID (exposed to browser for RTC SDK)           |
| `GOOGLE_CLIENT_ID`            | Google OAuth client ID (used by NextAuth)               |
| `GOOGLE_CLIENT_SECRET`        | Google OAuth client secret (used by NextAuth)           |

### Backend (`backend/.env.example`)

| Variable                      | Description                                              |
|-------------------------------|----------------------------------------------------------|
| `PORT`                        | Server port (default 10000)                             |
| `MONGODB_URI`                 | MongoDB Atlas connection string                         |
| `JWT_SECRET`                  | Secret for signing JWT tokens                           |
| `INTERNAL_API_SECRET`         | Server-to-server secret for `/api/auth/google-session` (`x-internal-api-secret` header); must match frontend |
| `GOOGLE_CLIENT_ID`            | Google OAuth client ID                                  |
| `GOOGLE_CLIENT_SECRET`        | Google OAuth client secret                              |
| `GOOGLE_CALLBACK_URL`         | `https://api.meetyoulive.net/api/auth/google/callback`  |
| `FRONTEND_URL`                | `https://www.meetyoulive.net`                           |
| `AGORA_APP_ID`                | Agora App ID for RTC token generation                   |
| `AGORA_APP_CERTIFICATE`       | Agora App Certificate for RTC token signing             |
| `STRIPE_SECRET_KEY`           | Stripe secret key (`sk_test_…` or `sk_live_…`)          |
| `STRIPE_WEBHOOK_SECRET`       | Stripe webhook signing secret                           |
| `STRIPE_SUBSCRIPTION_PRICE_ID`| Stripe Price ID for the subscription plan               |
| `SMTP_HOST`                   | SMTP host for email verification (leave blank to log codes to console) |
| `SMTP_PORT`                   | SMTP port (default 587)                                 |
| `SMTP_USER`                   | SMTP username                                           |
| `SMTP_PASS`                   | SMTP password                                           |
| `SMTP_FROM`                   | From address for outgoing email                         |
| `ADMIN_NAME`                  | Admin username for the seed script (default `meetyoulive`) |
| `ADMIN_EMAIL`                 | Admin email for the seed script                         |
| `ADMIN_PASSWORD`              | Admin password for the seed script                      |

## Initial admin setup

After deploying both the backend and the frontend for the first time, you must create the administrator account before anyone can manage the platform.

### Option A – Seed script (recommended for servers)

Run the following command from the `backend/` directory. Set `ADMIN_PASSWORD` to your chosen password (the username defaults to `meetyoulive`):

```bash
cd backend
ADMIN_PASSWORD=yourpassword npm run seed:admin

# With all options explicit:
ADMIN_USERNAME=meetyoulive ADMIN_EMAIL=admin@meetyoulive.net ADMIN_PASSWORD=yourpassword npm run seed:admin
```

The script connects to MongoDB using `MONGODB_URI` from your `.env` file, then **creates or updates** the admin account. You can re-run it at any time to reset the password.

### Changing the admin password later

Log in, go to **Profile → Change Password**, enter your current password and choose a new one.

## Google login flow

Google login goes through the following steps:

1. User clicks **Sign in with Google** → NextAuth redirects to Google consent screen.
2. Google redirects back to NextAuth callback → NextAuth creates a session.
3. The frontend enters a **"Connecting…"** state while it requests a backend JWT from `POST /api/auth/google-session` (with automatic retries).
4. Once the backend responds the JWT is stored and the user is taken to the dashboard.

The connecting delay on first login is caused by **Render free-tier cold starts** (the backend spins down after inactivity). This is expected behavior. See the [Uptime Monitoring](#uptime-monitoring) section below to eliminate the delay.

## Uptime Monitoring

The backend is hosted on Render's **free tier**, which suspends the service after ~15 minutes of inactivity. When the first request arrives after a suspension the backend needs ~30–60 seconds to restart (cold start), which is why the "Connecting…" screen appears during Google login.

To keep the backend always-on, set up a free uptime monitor that pings the backend health endpoint every 5–10 minutes:

### UptimeRobot (recommended — free)

1. Create a free account at [https://uptimerobot.com](https://uptimerobot.com).
2. Click **Add New Monitor**:
   - **Monitor Type**: HTTP(s)
   - **Friendly Name**: MeetYouLive API
   - **URL**: `https://api.meetyoulive.net/api/health`
   - **Monitoring Interval**: 5 minutes
3. Save. UptimeRobot will ping the backend every 5 minutes, preventing Render from suspending it.

### Other free options

| Service | Free monitors | Min interval |
|---------|---------------|--------------|
| [Better Uptime](https://betteruptime.com) | 10 | 3 min |
| [Freshping](https://freshping.io) | 50 | 1 min |
| [Statuspage (Atlassian)](https://www.atlassian.com/software/statuspage) | — | varies |

### Backend health endpoint

The backend exposes a lightweight health endpoint at `GET /api/health` that returns `200 OK`. This is the recommended URL to use with any uptime monitor.

## Notes

- `INTERNAL_API_SECRET` must be the same value in both Vercel and Render.
- `api.meetyoulive.net` must point to the Render backend hostname.
- The frontend uses NextAuth and requests a backend JWT from: `POST /api/auth/google-session`
- Google OAuth redirect URI must be `https://www.meetyoulive.net/api/auth/callback/google` (NextAuth callback, not the legacy backend route).
- The "Connecting…" delay after Google login is a Render cold-start artifact on the free tier. Set up UptimeRobot (see above) to eliminate it.
