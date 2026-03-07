# MeetYouLive

Aplicación social con dating, live streaming, chats, regalos, monedas y VR.

## Stack
- Next.js
- Tailwind CSS
- Vercel
- MongoDB
- NextAuth
- Stripe

## Secciones
- Home
- Login
- Register
- Dashboard
- Explore
- Live
- Chats
- Profile
- VR
- Coins
- Gifts

## Variables de entorno
Estas variables van en Vercel y no deben subirse al repositorio:

- NEXTAUTH_SECRET
- NEXTAUTH_URL
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- MONGODB_URI
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET
- NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

## Desarrollo local
```
npm install
npm run dev
```

## Producción
Desplegado en Vercel conectado a GitHub.

## Architecture

| Layer    | Service       | URL                          |
|----------|---------------|------------------------------|
| Frontend | Vercel        | https://meetyoulive.net      |
| Backend  | Render        | https://api.meetyoulive.net  |
| Database | MongoDB Atlas | —                            |
| DNS      | GoDaddy       | meetyoulive.net              |

## Repository structure

```
MeetYouLive/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── middlewares/
│   │   ├── services/
│   │   ├── config/
│   │   ├── app.js
│   │   └── server.js
│   ├── vercel.json
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── pages/    (React + React Router pages)
│   │   ├── lib/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   ├── vercel.json
│   ├── package.json
│   └── .env.example
├── docker-compose.yml
├── render.yaml
├── README.md
└── .gitignore
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

Frontend runs on [http://localhost:5173](http://localhost:5173) (Vite default).

## Deployment

### 1. Frontend → Vercel

1. Import the repo in [Vercel](https://vercel.com), set the **Root Directory** to `frontend`, and choose **Vite** as the framework preset.
2. Set **Build Command** to `npm run build` and **Output Directory** to `dist`.
3. Add environment variables:
   ```
   VITE_API_URL=https://api.meetyoulive.net
   VITE_LIVE_PROVIDER_KEY=xxxx
   ```
4. In **Project → Settings → Domains** add `meetyoulive.net` and `www.meetyoulive.net`.
5. In GoDaddy DNS set:
   - `A` record: `@` → `76.76.21.21`
   - `CNAME` record: `www` → `cname.vercel-dns.com`

### 2. Backend → Render

A `render.yaml` is included so Render can auto-configure the service.

1. Connect the repo in [Render](https://render.com).
2. Set the secret environment variables in **Environment**:
   - `MONGO_URI`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_SUBSCRIPTION_PRICE_ID`
3. In **Settings → Custom Domains** add `api.meetyoulive.net`.
4. In GoDaddy DNS add a `CNAME` record: `api` → `<your-service>.onrender.com`.

### 3. Google OAuth

In [Google Cloud Console](https://console.cloud.google.com) → **OAuth Client**:

- **Authorized Redirect URIs**: `https://api.meetyoulive.net/api/auth/google/callback`
- **Authorized JavaScript origins**: `https://meetyoulive.net`

### 4. Docker (local)

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
# fill in your values
docker-compose up --build
```

## Environment variables

### Backend (`backend/.env.example`)

| Variable                      | Description                                              |
|-------------------------------|----------------------------------------------------------|
| `PORT`                        | Server port (default 10000)                             |
| `MONGO_URI`                   | MongoDB connection string                               |
| `JWT_SECRET`                  | Secret for signing JWT tokens                           |
| `GOOGLE_CLIENT_ID`            | Google OAuth client ID                                  |
| `GOOGLE_CLIENT_SECRET`        | Google OAuth client secret                              |
| `GOOGLE_CALLBACK_URL`         | `https://api.meetyoulive.net/api/auth/google/callback`  |
| `FRONTEND_URL`                | `https://meetyoulive.net`                               |
| `STRIPE_SECRET_KEY`           | Stripe secret key (`sk_test_…` or `sk_live_…`)          |
| `STRIPE_WEBHOOK_SECRET`       | Stripe webhook signing secret                           |
| `STRIPE_SUBSCRIPTION_PRICE_ID`| Stripe Price ID for the subscription plan               |

### Frontend (`frontend/.env.example`)

| Variable                      | Description                                             |
|-------------------------------|---------------------------------------------------------|
| `VITE_API_URL`                | Backend API base URL (e.g. `https://api.meetyoulive.net`) |
| `VITE_LIVE_PROVIDER_KEY`      | Live streaming provider API key                         |
