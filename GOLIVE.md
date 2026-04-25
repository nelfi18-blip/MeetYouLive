# GOLIVE Checklist — Payout Safety System

Use this checklist before deploying the payout feature to production.

## Backend

- [ ] `MONGO_URI` is set and MongoDB Atlas cluster is reachable
- [ ] `JWT_SECRET` is set to a strong random value
- [ ] `NEXTAUTH_SECRET` is set (shared with frontend)
- [ ] `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_SUBSCRIPTION_PRICE_ID` are set
- [ ] `FRONTEND_URL` is set to the production frontend URL (for CORS)
- [ ] Backend deployed and `/api/admin/payouts` returns 200 for an authenticated admin
- [ ] Backend deployed and `POST /api/creator/payout` is accessible for approved creators
- [ ] Payout model enum includes: `pending`, `approved`, `processing`, `completed`, `paid`, `rejected`
- [ ] Admin PATCH `/api/admin/payouts/:id` accepts `approved`, `paid`, and `rejected` transitions
- [ ] Rejected payouts atomically restore `earningsCoins` via `$inc`
- [ ] Duplicate payout check covers statuses `pending`, `approved`, `processing`
- [ ] Minimum payout threshold enforced (`MIN_PAYOUT_COINS = 100`)
- [ ] Suspended creators blocked by `requireApprovedCreator` middleware

## Frontend

- [ ] `NEXT_PUBLIC_API_URL` is set to the production backend URL
- [ ] `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` are set
- [ ] `NEXT_PUBLIC_LIVE_PROVIDER_KEY` is set
- [ ] `npm run build` in `frontend/` passes with zero errors
- [ ] `/admin` loads and shows the admin dashboard
- [ ] `/admin/payouts` loads and lists payout requests
- [ ] `/admin/payouts` filter tabs work for: Todos, Pendientes, Aprobados, En proceso, Pagados, Rechazados
- [ ] Approve action on a pending payout sets status → `approved`
- [ ] Pay action on an approved payout sets status → `paid`
- [ ] Reject action opens confirmation modal with rejection reason input
- [ ] Rejected payouts show coins-restored confirmation in modal
- [ ] Creator dashboard (`/creator`) still loads for approved creators
- [ ] Creator payout request button is disabled when balance < minimum or payout already pending
- [ ] Payout history (`/api/creator/payout-history`) is accessible for approved creators
- [ ] Agency dashboard still loads and commission split is unaffected

## Regression

- [ ] Stripe checkout flow (`/coins`, `/subscription`) still works end-to-end
- [ ] Stripe webhook endpoint (`/api/webhook`) processes events correctly
- [ ] Gift sending (`/gifts`) correctly credits creator `earningsCoins` with the platform split
- [ ] Agency commission split is applied only when `status: "active"` and `subCreatorAgreed: true`
- [ ] Admin login (`/admin/login`) works with valid admin credentials
- [ ] Auth flow (Google OAuth + NextAuth) works on the frontend

## Post-deploy smoke tests

1. Log in as an approved creator with `earningsCoins >= 100`
2. Request a payout → status should be `pending`
3. Re-request → should be blocked with "Ya tienes una solicitud pendiente"
4. Log in as admin → go to `/admin/payouts`
5. Approve the payout → status changes to `approved`
6. Mark as paid → status changes to `paid`, `processedAt` is set
7. Create a second payout and reject it → `earningsCoins` restored to creator
8. Verify creator's `earningsCoins` is correct after rejection (coins returned)
