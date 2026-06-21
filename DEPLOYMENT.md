# MeetYouLive — Production Deployment Checklist

## 1. Render: Upgrade to Starter Tier (Eliminate Cold Starts)

The free Render tier spins down after 15 minutes of inactivity, causing slow first-request latency. Upgrading eliminates this.

**Steps:**
1. Log in to [dashboard.render.com](https://dashboard.render.com)
2. Select your backend service (`meetyoulive-backend`)
3. Go to **Settings → Instance Type**
4. Upgrade to **Starter** ($7/mo) — this keeps the instance always running
5. Click **Save Changes** and wait for the service to redeploy

---

## 2. UptimeRobot: Free Keep-Alive Alternative

If upgrading Render is not an option, use UptimeRobot to ping the health endpoint every 5 minutes:

1. Sign up at [uptimerobot.com](https://uptimerobot.com) (free tier)
2. Click **Add New Monitor**
3. Set type: **HTTP(s)**
4. Set friendly name: `MeetYouLive API`
5. Set URL: `https://meetyoulive.onrender.com/api/health`
6. Set monitoring interval: **5 minutes**
7. Click **Create Monitor**

> **Note:** Render still spins down on the free tier after 15 minutes, but a 5-minute ping keeps it awake during expected traffic hours.

---

## 3. Backend URL and SSL Checklist — `meetyoulive.onrender.com`

The official production backend URL is the direct Render URL:

```text
https://meetyoulive.onrender.com
```

### 3.1 Diagnose the Backend URL

**Check the API health endpoint in a browser or terminal:**
```bash
curl -v https://meetyoulive.onrender.com/api/health
```
- ✅ Returns `{"status":"ok","message":"Servidor de MeetYouLive activo"}` → backend URL is healthy.
- ❌ Connection, SSL, or 5xx errors → check the Render service status and environment variables.

**Check the certificate from the command line:**
```bash
openssl s_client -connect meetyoulive.onrender.com:443 -servername meetyoulive.onrender.com < /dev/null 2>&1 | grep -E "subject|issuer|Verify|error"
```
- ✅ `Verify return code: 0 (ok)` → certificate is valid.
- ❌ Any other verify code → verify the Render service URL and service status.

### 3.2 Vercel API URL

In Vercel, set:

```text
NEXT_PUBLIC_API_URL=https://meetyoulive.onrender.com
```

Redeploy the frontend after changing this value.

### 3.3 Post-Fix Verification

| Check | Command / Action | Expected result |
|-------|-----------------|-----------------|
| Backend health | `curl -v https://meetyoulive.onrender.com/api/health` | HTTP 200, JSON body |
| Frontend loads | Open `https://meetyoulive.net` | Home page renders without "Application error" |
| WebSocket works | Log in → open a live stream → DevTools → Network → WS | `wss://meetyoulive.onrender.com` connection established |
| OAuth flow works | Open incognito → click **Iniciar sesión con Google** | Redirects back and session is active |

### 3.4 Prevention Checklist

- [ ] Keep `NEXT_PUBLIC_API_URL` set to `https://meetyoulive.onrender.com` in Vercel.
- [ ] Set up an UptimeRobot monitor on `https://meetyoulive.onrender.com/api/health` (see Section 2).
- [ ] Check Render service health after environment variable changes.

---

## 4. Environment Variables Checklist

### Backend (Render)

| Variable                       | Required | Description                                                         |
|--------------------------------|----------|---------------------------------------------------------------------|
| `PORT`                         | No       | Server port (Render sets this automatically; defaults to 10000)     |
| `MONGODB_URI`                  | **Yes**  | MongoDB Atlas connection string                                     |
| `JWT_SECRET`                   | **Yes**  | Secret for signing JWT tokens (use a long random string)            |
| `GOOGLE_CLIENT_ID`             | **Yes**  | Google OAuth client ID                                              |
| `GOOGLE_CLIENT_SECRET`         | **Yes**  | Google OAuth client secret                                          |
| `GOOGLE_CALLBACK_URL`          | **Yes**  | `https://meetyoulive.onrender.com/api/auth/google/callback`         |
| `FRONTEND_URL`                 | **Yes**  | `https://meetyoulive.net` (used for CORS)                          |
| `AGORA_APP_ID`                 | **Yes**  | Agora App ID for live streaming                                     |
| `AGORA_APP_CERTIFICATE`        | **Yes**  | Agora App Certificate for token generation                          |
| `STRIPE_SECRET_KEY`            | **Yes**  | Stripe secret key (`sk_live_...` in production)                     |
| `STRIPE_WEBHOOK_SECRET`        | **Yes**  | Stripe webhook signing secret (`whsec_...`)                         |
| `STRIPE_SUBSCRIPTION_PRICE_ID` | **Yes**  | Stripe Price ID for VIP subscription                                |
| `INTERNAL_API_SECRET`          | **Yes**  | Shared secret for server-to-server calls (same value in Vercel)     |
| `ADMIN_NAME`                   | No       | Seed admin display name                                             |
| `ADMIN_EMAIL`                  | No       | Seed admin email                                                    |
| `ADMIN_PASSWORD`               | No       | Seed admin password (only used on first boot)                       |
| `SMTP_HOST`                    | No       | SMTP host for email delivery                                        |
| `SMTP_PORT`                    | No       | SMTP port (default: 587)                                            |
| `SMTP_USER`                    | No       | SMTP username                                                       |
| `SMTP_PASS`                    | No       | SMTP password                                                       |
| `SMTP_FROM`                    | No       | From address for outgoing emails                                    |
| `FCM_PROJECT_ID`               | No       | Firebase project ID for push notifications                          |
| `FCM_CLIENT_EMAIL`             | No       | Firebase service account email                                      |
| `FCM_PRIVATE_KEY`              | No       | Firebase service account private key                                |
| `SENTRY_DSN`                   | No       | Sentry DSN for error monitoring (leave blank to disable)            |

### Frontend (Vercel)

| Variable                        | Required | Description                                           |
|---------------------------------|----------|-------------------------------------------------------|
| `NEXT_PUBLIC_API_URL`           | **Yes**  | Backend API base URL (`https://meetyoulive.onrender.com`)          |
| `NEXT_PUBLIC_AGORA_APP_ID`      | **Yes**  | Agora App ID for frontend live streaming                          |
| `GOOGLE_CLIENT_ID`              | **Yes**  | Google OAuth client ID (same as backend)              |
| `GOOGLE_CLIENT_SECRET`          | **Yes**  | Google OAuth client secret (same as backend)          |
| `NEXTAUTH_SECRET`               | **Yes**  | NextAuth signing secret (frontend only)                            |
| `NEXTAUTH_URL`                  | **Yes**  | `https://meetyoulive.net`                         |
| `INTERNAL_API_SECRET`           | **Yes**  | Same value as backend `INTERNAL_API_SECRET`           |

---

## 5. MongoDB Atlas Backup Configuration

1. Log in to [cloud.mongodb.com](https://cloud.mongodb.com)
2. Select your cluster → **Backup**
3. Enable **Continuous Cloud Backup** or **Scheduled Snapshots**
4. Recommended settings:
   - **Frequency:** Daily snapshots
   - **Retention:** 7 days minimum
   - **Point-in-time recovery:** Enable if on M10+ tier
5. Test restore procedure quarterly: **Backup → Restore → select snapshot → restore to new cluster**

> **Note:** Backups are only available on M2+ clusters. Free M0 clusters do not support automated backups.

---

## 6. Post-Deploy Verification Steps

Run these checks after each production deployment:

### 6.1 Health Endpoint
```bash
curl https://meetyoulive.onrender.com/api/health
# Expected: {"status":"ok","message":"Servidor de MeetYouLive activo"}
```

### 6.2 OAuth Flow
1. Open `https://meetyoulive.net` in an incognito window
2. Click **Iniciar sesión con Google**
3. Complete OAuth flow
4. Verify user is redirected back and session is active

### 6.3 Stripe Test Payment
1. Log in as a test user
2. Go to **Coins → Buy Coins**
3. Use Stripe test card: `4242 4242 4242 4242` (any future expiry, any CVC)
4. Verify coins are credited to the user's balance
5. Check Stripe dashboard for the completed payment

### 6.4 WebSocket Connection
1. Log in and open `/live` or any live stream
2. Open browser DevTools → Network → WS
3. Verify a WebSocket connection is established to `wss://meetyoulive.onrender.com`
4. Send a chat message and verify it appears in real time
