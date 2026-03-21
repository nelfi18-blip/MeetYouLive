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
MeerYouLive/
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

- ✅ Register / Login (JWT)
- ✅ Google OAuth login
- ✅ Roles (user / creator / admin)
- ✅ Videos (public & private with payment)
- ✅ Live streaming
- ✅ Gifts / Regalos
- ✅ Stripe payments (one-time + subscriptions)
- ✅ Moderation & reporting
- ✅ Admin panel

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
   NEXT_PUBLIC_API_URL=https://api.meetyoulive.net
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
   NEXTAUTH_SECRET=your_nextauth_secret
   FRONTEND_URL=https://www.meetyoulive.net
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   GOOGLE_CALLBACK_URL=https://api.meetyoulive.net/api/auth/google/callback
   STRIPE_SECRET_KEY=your_stripe_secret_key
   STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
   STRIPE_SUBSCRIPTION_PRICE_ID=your_stripe_price_id
   ```
3. In **Settings → Custom Domains** add `api.meetyoulive.net`.
4. In GoDaddy DNS add a `CNAME` record: `api` → `<your-service>.onrender.com`.

### Google OAuth

In [Google Cloud Console](https://console.cloud.google.com) → **OAuth Client**:

- **Authorized Redirect URIs**: `https://api.meetyoulive.net/api/auth/google/callback`
- **Authorized JavaScript origins**: `https://www.meetyoulive.net`

## Environment variables

### Frontend (`frontend/.env.example`)

| Variable                      | Description                                             |
|-------------------------------|---------------------------------------------------------|
| `NEXTAUTH_URL`                | Canonical URL of the frontend                           |
| `NEXTAUTH_SECRET`             | NextAuth signing/encryption secret                      |
| `NEXT_PUBLIC_API_URL`         | Backend API base URL                                    |
| `GOOGLE_CLIENT_ID`            | Google OAuth client ID (used by NextAuth)               |
| `GOOGLE_CLIENT_SECRET`        | Google OAuth client secret (used by NextAuth)           |

### Backend (`backend/.env.example`)

| Variable                      | Description                                              |
|-------------------------------|----------------------------------------------------------|
| `PORT`                        | Server port (default 10000)                             |
| `MONGODB_URI`                 | MongoDB connection string                               |
| `JWT_SECRET`                  | Secret for signing JWT tokens                           |
| `NEXTAUTH_SECRET`             | Shared secret verified via `x-nextauth-secret` header   |
| `GOOGLE_CLIENT_ID`            | Google OAuth client ID                                  |
| `GOOGLE_CLIENT_SECRET`        | Google OAuth client secret                              |
| `GOOGLE_CALLBACK_URL`         | `https://api.meetyoulive.net/api/auth/google/callback`  |
| `FRONTEND_URL`                | `https://www.meetyoulive.net`                           |
| `STRIPE_SECRET_KEY`           | Stripe secret key (`sk_test_…` or `sk_live_…`)          |
| `STRIPE_WEBHOOK_SECRET`       | Stripe webhook signing secret                           |
| `STRIPE_SUBSCRIPTION_PRICE_ID`| Stripe Price ID for the subscription plan               |

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

### Option B – Web setup page

1. Open `https://<your-frontend-url>/setup` in a browser.  
   (A **"¿Primera vez aquí? Configurar administrador"** link also appears at the bottom of the login page.)
2. Fill in the form with your chosen **username**, **email**, and **password** (minimum 6 characters).
3. Submit the form. The admin account is created and you are logged in automatically.
4. The `/setup` page is disabled permanently once an admin account exists.

### Changing the admin password later

Log in, go to **Profile → 🔑 Contraseña**, enter your current password and choose a new one.

## Notes

- `NEXTAUTH_SECRET` must be the same value in both Vercel and Render.
- `api.meetyoulive.net` must point to the Render backend hostname.
- The frontend uses NextAuth and requests a backend JWT from: `POST /api/auth/google-session`
