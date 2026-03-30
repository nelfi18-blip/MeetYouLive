This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, copy the environment file and fill in your values:

```bash
cp .env.example .env.local
```

Then run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Pages

- `/login` — Email/password login form and Google OAuth (via NextAuth)
- `/dashboard` — Protected user dashboard (requires backend JWT token)
- `/auth/success` — Legacy backend OAuth callback handler (kept for compatibility)
- `/auth/error` — NextAuth error page

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL of the MeetYouLive backend (e.g. `https://yourapp.onrender.com`) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (used by NextAuth) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret (used by NextAuth) |
| `NEXTAUTH_SECRET` | NextAuth signing/encryption secret |
| `NEXTAUTH_URL` | Canonical frontend URL (e.g. `https://www.meetyoulive.net`) |
| `INTERNAL_API_SECRET` | Shared server-to-server secret for `/api/auth/google-session` (must match backend) |

## Deploy on Vercel

1. Import the repo and set the **Root Directory** to `frontend`.
2. Add the environment variables listed above.
3. Deploy 🚀

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Google login flow

Google login uses NextAuth and follows these steps:

1. User clicks **Sign in with Google** → NextAuth redirects to the Google consent screen.
2. Google redirects back to the NextAuth callback (`/api/auth/callback/google`).
3. The NextAuth `jwt()` callback calls `POST /api/auth/google-session` on the backend to obtain a backend JWT.
4. If the backend is cold-starting (Render free tier), the login page retries automatically with a delay between each attempt.
5. Once the backend JWT is available it is stored in `localStorage` and the user is taken to `/dashboard`.
