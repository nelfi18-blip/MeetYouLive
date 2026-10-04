# MeetYouLive

MeetYouLive is a live streaming and social platform with:

- Next.js frontend deployed on Vercel
- Express backend deployed on Render
- MongoDB Atlas database
- Google authentication
- JWT-based backend session support

## Architecture

For the official product direction around user communication, retention, creator boundaries, and future communication phases, see [Product Communication and Retention Architecture](PRODUCT_COMMUNICATION_RETENTION_ARCHITECTURE.md).

### Frontend
- Platform: Vercel
- Directory: `frontend`
- URL: `https://meetyoulive.net`

### Backend
- Platform: Render
- Directory: `backend`
- URL: `https://meetyoulive.onrender.com`

### Database
- MongoDB Atlas

### Text AI moderation foundation (Phase 1, backend only)

`backend/src/services/textModeration.service.js` exposes `evaluateText(input)`
and `createTextModerationService({ provider = null, timeoutMs = 2000 })`.
This is an internal, provider-decoupled detection service, not an enforcement
engine. No real moderation provider is configured in the inspected repository;
the production default makes no outbound calls and does not pretend to classify.
There are no new dependencies, endpoints, workflow hooks or dashboard changes.

#### Input and provider contract

- Input is exactly `{ context, text }`. Context must be `chat_message`,
  `live_message`, `room_message` or `profile_text`. It is descriptive metadata,
  not proof of access to any content.
- Text must be a nonempty, non-whitespace string, at most **5000 UTF-16 code
  units** (JavaScript string length), measured before trimming. Text is not
  modified. Unknown fields, IDs/references, user/request objects, credentials,
  reviewed flags and enforcement fields are rejected with a generic `TypeError`.
  Input/configuration errors are not converted into successful evaluations.
- An injected adapter is `{ name, evaluateText({ text }, { signal }) }`.
  Its trusted name is 1–64 ASCII letters, digits, underscores or hyphens.
  Only text goes to the adapter; context and other metadata do not. Future
  callers must select necessary content, never concatenate authentication,
  passwords, unnecessary emails, payment details or full request/user objects.
- Adapter success is exactly `{ status: "evaluated", riskLevel, categories,
  confidence?, scores? }`. Risk levels: `safe`, `low`, `medium`, `high`,
  `critical`. Categories: `harassment`, `hate`, `sexual`, `violence`,
  `self_harm`, `scam`, `spam`, `child_safety`, `other`.
- Categories must be unique; `safe` requires an empty array, every other level
  requires at least one category. Optional confidence and category-keyed scores
  must be finite numbers in `[0, 1]`; unknown keys and coercion are disallowed.
  Scores are provider-delivered metadata, not thresholds for enforcement.
  An unavailable adapter may return exactly `{ status: "provider_unavailable" }`.
  Unknown/extra output fields (including actions or echoed text) are invalid.

#### Returned signal and availability

Every result contains `context`, `provider` (adapter name, or `null` when absent),
`createdAt` (ISO timestamp at evaluation start), `status`, `riskLevel`,
and `categories`. Only validated `evaluated` results can include confidence or
scores. Text and provider errors are never included, persisted or logged.

Statuses are `evaluated`, `not_configured`, `provider_unavailable`,
`provider_error`, `invalid_result`, or `timeout`. All unevaluated statuses have
`riskLevel: null`, `categories: []` and no confidence/scores: unavailable is
**neither safe nor dangerous**. Synchronous throws and rejected adapter promises
are contained. Duration is bounded to 2000 ms by default, configurable from
1–5000 ms; timeout aborts the supplied signal and late rejections are handled.
Adapters must honor cancellation and implement asynchronous, bounded I/O;
the service cannot preempt synchronous CPU work or force cancellation of an
adapter that ignores its signal.

No AI level, including `critical`, bans, suspends, blocks, deletes, expels,
changes Coins/balances or changes Creator eligibility. The service has no
database, socket, moderation-action or economic dependencies. Chat, Live, calls,
Random and Rooms are not wired to it and remain independent of provider failure.
Authentication, authorization and rate-limit tests for a new endpoint are not
applicable: none is exposed. A future integration must authorize access first,
derive content server-side, and keep validation/auth errors separate from
provider failures; this service is not an authorization boundary.

#### Persistence and human review deliberately deferred

Inspection found that `Report` requires a real human `reporter` and targets
`user`, `live` or `video`; it is not an AI evaluation store. `ModerationActions`
is an existing UI component, not an evaluation model; blocks are existing
`User.blockedUsers` / `User.isBlocked` state, not a separate `Block` model.
Existing `/api/admin/reports` permissions include admin, moderator and
content_reviewer; `/api/moderation/reports` uses moderator/admin permissions.
Those human report semantics, permissions and enforcement are unchanged.

Phase 1 returns an **in-memory signal only**, without durable flags, reviewed
state or content references. With no configured provider or authorized content
integration, persistence would add unused records and a premature schema.
No human reporter is fabricated and no second reporting/review workflow exists.
For Phase 2, an authorized server-side integration must resolve and validate
context-specific content/target references and ownership/access, then decide
minimal metadata storage without duplicating sensitive text. Correlate signals
with existing reports by the resolved target type/ID (not a fabricated reporter);
message/room references need explicit mapping because current Report targets
do not include them. Any persisted reviewed state must be staff-controlled.
AI detects → records/flags → human reviews → the existing moderation system
decides remains the intended pipeline; durable recording and human review of AI
signals are **not yet implemented**. Real adapters, integration, retention,
staff-authorized correlation/review and provider privacy controls remain Phase 2.

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
   NEXTAUTH_URL=https://meetyoulive.net
   NEXTAUTH_SECRET=your_nextauth_secret
   INTERNAL_API_SECRET=your_internal_api_secret
   NEXT_PUBLIC_API_URL=https://meetyoulive.onrender.com
   NEXT_PUBLIC_AGORA_APP_ID=your_agora_app_id
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   ```
3. In **Project → Settings → Domains** add `meetyoulive.net` as the primary domain and `www.meetyoulive.net` as a redirecting alias.
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
   FRONTEND_URL=https://meetyoulive.net
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   GOOGLE_CALLBACK_URL=https://meetyoulive.onrender.com/api/auth/google/callback
    AGORA_APP_ID=your_agora_app_id
    AGORA_APP_CERTIFICATE=your_agora_app_certificate
    STRIPE_SECRET_KEY=your_stripe_secret_key
    STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
    STRIPE_SUBSCRIPTION_PRICE_ID=your_stripe_price_id
    STRIPE_VIP_SILVER_PRICE_ID=your_stripe_vip_silver_price_id
    STRIPE_VIP_GOLD_PRICE_ID=your_stripe_vip_gold_price_id
    STRIPE_VIP_PLATINUM_PRICE_ID=your_stripe_vip_platinum_price_id
    SMTP_HOST=your_smtp_host
    SMTP_PORT=587
    SMTP_USER=your_smtp_username
    SMTP_PASS=your_smtp_password
    SMTP_FROM=MeetYouLive <noreply@meetyoulive.net>
    ```
3. Use the Render service URL `https://meetyoulive.onrender.com` as the production backend URL.

### Google OAuth

In [Google Cloud Console](https://console.cloud.google.com) → **OAuth Client**:

- **Authorized Redirect URIs**: `https://meetyoulive.net/api/auth/callback/google`
- **Authorized JavaScript origins**: `https://meetyoulive.net`

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
| `GOOGLE_CALLBACK_URL`         | `https://meetyoulive.onrender.com/api/auth/google/callback`  |
| `FRONTEND_URL`                | `https://meetyoulive.net`                           |
| `AGORA_APP_ID`                | Agora App ID for RTC token generation                   |
| `AGORA_APP_CERTIFICATE`       | Agora App Certificate for RTC token signing             |
| `STRIPE_SECRET_KEY`           | Stripe secret key (`sk_test_…` or `sk_live_…`)          |
| `STRIPE_WEBHOOK_SECRET`       | Stripe webhook signing secret                           |
| `STRIPE_SUBSCRIPTION_PRICE_ID`| Stripe Price ID for the subscription plan               |
| `SMTP_HOST`                   | SMTP host for verification and password reset emails (**required in production**) |
| `SMTP_PORT`                   | SMTP port (default 587; use 465 for SSL/TLS)           |
| `SMTP_USER`                   | SMTP username (**required in production**)              |
| `SMTP_PASS`                   | SMTP password (**required in production**)              |
| `SMTP_FROM`                   | Optional `From:` address for outgoing email             |
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
   - **URL**: `https://meetyoulive.onrender.com/api/health`
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
- The production backend URL is `https://meetyoulive.onrender.com`.
- The frontend uses NextAuth and requests a backend JWT from: `POST /api/auth/google-session`
- Google OAuth redirect URI must be `https://meetyoulive.net/api/auth/callback/google` (NextAuth callback, not the legacy backend route).
- The "Connecting…" delay after Google login is a Render cold-start artifact on the free tier. Set up UptimeRobot (see above) to eliminate it.
