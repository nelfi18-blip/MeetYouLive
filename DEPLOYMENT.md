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
5. Set URL: `https://api.meetyoulive.net/api/health`
6. Set monitoring interval: **5 minutes**
7. Click **Create Monitor**

> **Note:** Render still spins down on the free tier after 15 minutes, but a 5-minute ping keeps it awake during expected traffic hours.

---

## 3. SSL Checklist — `api.meetyoulive.net`

A broken SSL certificate on the backend causes an `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` error in the browser and makes the entire frontend crash with "Application error". Use this checklist to diagnose and fix it.

---

### 3.1 Diagnose the Problem

**Check the API health endpoint in a browser or terminal:**
```bash
curl -v https://api.meetyoulive.net/api/health
```
- ✅ Returns `{"status":"ok","message":"Servidor de MeetYouLive activo"}` → SSL is fine.
- ❌ Returns `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` or `SSL_ERROR_RX_RECORD_TOO_LONG` → certificate is broken or missing. Continue to 3.2.

**Check the certificate from the command line:**
```bash
openssl s_client -connect api.meetyoulive.net:443 -servername api.meetyoulive.net < /dev/null 2>&1 | grep -E "subject|issuer|Verify|error"
```
- ✅ `Verify return code: 0 (ok)` → certificate is valid.
- ❌ Any other verify code → certificate is invalid or expired.

---

### 3.2 Verify DNS Configuration (must be CNAME, not A record)

Render uses a shared IP pool. An `A` record will break SSL because the certificate is issued to the `.onrender.com` hostname, not a raw IP.

```bash
dig api.meetyoulive.net
# or, on Windows/mobile:
nslookup api.meetyoulive.net
```

**Expected result (✅ correct):**
```
api.meetyoulive.net.  CNAME  <service-name>.onrender.com.
```

**Wrong result (❌ fix required):**
```
api.meetyoulive.net.  A  <IP address>
```

**How to fix in GoDaddy:**
1. Log in to [godaddy.com](https://godaddy.com) → **DNS** for `meetyoulive.net`.
2. Find the `api` record.
3. If it is type `A`, delete it.
4. Add a new record:
   - **Type:** `CNAME`
   - **Name:** `api`
   - **Value:** `<service-name>.onrender.com` (the `.onrender.com` URL of your backend service — visible in Render dashboard → Settings → Domains)
   - **TTL:** 600 seconds (or lowest available)
5. Save and wait up to 10 minutes for DNS propagation.

---

### 3.3 Re-provision the SSL Certificate in Render

After the DNS record is correct, force Render to re-issue the certificate:

1. Log in to [dashboard.render.com](https://dashboard.render.com).
2. Select your backend service (`meetyoulive-backend`).
3. Go to **Settings → Custom Domains**.
4. If `api.meetyoulive.net` shows **Certificate Failed** or **Pending**:
   - Click **Delete** (remove the custom domain entry).
   - Click **Add Custom Domain**.
   - Enter `api.meetyoulive.net` again and confirm.
5. Wait **2–5 minutes**. Render will call Let's Encrypt to issue a new certificate.
6. The status should change to **Active** with a green checkmark.

> **Tip:** Render provisions certificates via Let's Encrypt (ACME HTTP-01 challenge). The DNS `CNAME` must be correct *before* you add the domain back, otherwise the challenge will fail and you'll need to retry.

---

### 3.4 Immediate Fallback (Use `.onrender.com` URL Directly)

If the SSL fix takes more than a few minutes and you need the app running now:

1. In [Vercel dashboard](https://vercel.com) → your project → **Settings → Environment Variables**.
2. Change `NEXT_PUBLIC_API_URL` from `https://api.meetyoulive.net` to your direct Render URL:
   ```
   https://<service-name>.onrender.com
   ```
3. Click **Save**, then go to **Deployments → Redeploy** (or trigger a **Manual Deploy**).
4. Verify the frontend loads by opening `https://www.meetyoulive.net`.

> **Remember to revert** `NEXT_PUBLIC_API_URL` back to `https://api.meetyoulive.net` once the custom-domain certificate is active again.

---

### 3.5 Post-Fix Verification

Run all of these checks after fixing SSL:

| Check | Command / Action | Expected result |
|-------|-----------------|-----------------|
| Certificate valid | `curl -v https://api.meetyoulive.net/api/health` | HTTP 200, JSON body |
| No SSL error in browser | Open `https://api.meetyoulive.net/api/health` in Chrome | No `ERR_SSL_*` warning |
| Frontend loads | Open `https://www.meetyoulive.net` | Home page renders without "Application error" |
| WebSocket works | Log in → open a live stream → DevTools → Network → WS | `wss://api.meetyoulive.net` connection established |
| OAuth flow works | Open incognito → click **Iniciar sesión con Google** | Redirects back and session is active |

---

### 3.6 Prevention Checklist

Do these things to avoid future SSL breakage:

- [ ] **Use CNAME, never A record** for `api.meetyoulive.net` (see 3.2).
- [ ] **Set up an UptimeRobot monitor** on `https://api.meetyoulive.net/api/health` (see Section 2) — it will alert you if the endpoint goes down, which can indicate a broken certificate.
- [ ] **Check Render custom domain status** after any DNS change: go to Settings → Custom Domains and confirm the badge shows **Active**.
- [ ] **Never change the DNS record type from CNAME to A** unless you move the backend off Render.
- [ ] **Renewal is automatic** — Render auto-renews Let's Encrypt certificates every 60–90 days. No manual action is needed as long as the CNAME record stays correct.
- [ ] **Bookmark the Render dashboard** to quickly access Settings → Custom Domains when issues arise.

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
| `GOOGLE_CALLBACK_URL`          | **Yes**  | `https://api.meetyoulive.net/api/auth/google/callback`              |
| `FRONTEND_URL`                 | **Yes**  | `https://www.meetyoulive.net` (used for CORS)                       |
| `AGORA_APP_ID`                 | **Yes**  | Agora App ID for live streaming                                     |
| `AGORA_APP_CERTIFICATE`        | **Yes**  | Agora App Certificate for token generation                          |
| `STRIPE_SECRET_KEY`            | **Yes**  | Stripe secret key (`sk_live_...` in production)                     |
| `STRIPE_WEBHOOK_SECRET`        | **Yes**  | Stripe webhook signing secret (`whsec_...`)                         |
| `STRIPE_SUBSCRIPTION_PRICE_ID` | **Yes**  | Stripe Price ID for VIP subscription                                |
| `INTERNAL_API_SECRET`          | **Yes**  | Shared secret for server-to-server calls (same value in Vercel)     |
| `NEXTAUTH_SECRET`              | **Yes**  | Shared with Vercel; used to verify `/api/auth/google-session`        |
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
| `NEXT_PUBLIC_API_URL`           | **Yes**  | Backend API base URL (`https://api.meetyoulive.net`)  |
| `NEXT_PUBLIC_LIVE_PROVIDER_KEY` | **Yes**  | Agora App ID for frontend live streaming              |
| `GOOGLE_CLIENT_ID`              | **Yes**  | Google OAuth client ID (same as backend)              |
| `GOOGLE_CLIENT_SECRET`          | **Yes**  | Google OAuth client secret (same as backend)          |
| `NEXTAUTH_SECRET`               | **Yes**  | NextAuth signing secret (same value as backend)       |
| `NEXTAUTH_URL`                  | **Yes**  | `https://www.meetyoulive.net`                         |
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
curl https://api.meetyoulive.net/api/health
# Expected: {"status":"ok","message":"Servidor de MeetYouLive activo"}
```

### 6.2 OAuth Flow
1. Open `https://www.meetyoulive.net` in an incognito window
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
3. Verify a WebSocket connection is established to `wss://api.meetyoulive.net`
4. Send a chat message and verify it appears in real time
