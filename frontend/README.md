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

- `/login` — Email/password login form and Google OAuth link
- `/dashboard` — Protected user dashboard (requires JWT token)
- `/auth/success` — Google OAuth callback handler

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL of the MeetYouLive backend (e.g. `https://api.meetyoulive.net`) |

## Deploy on Vercel

Import the repo, add the environment variables above, and deploy 🚀

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
