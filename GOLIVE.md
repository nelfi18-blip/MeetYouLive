# MeetYouLive – Go-Live Checklist

This checklist must be completed before switching to production traffic.

## 1. Stripe Configuration

- [ ] Replace test keys (`sk_test_...`, `pk_test_...`) with **LIVE** keys in backend `.env` / Render environment
- [ ] Update `STRIPE_WEBHOOK_SECRET` with the live endpoint secret from the Stripe dashboard
- [ ] Verify `STRIPE_SUBSCRIPTION_PRICE_ID` points to the live Price ID
- [ ] In the Stripe dashboard → Webhooks: confirm the endpoint URL is the production backend (`https://<backend>.onrender.com/api/webhooks/stripe`) and events include `checkout.session.completed`, `customer.subscription.*`

## 2. Environment Variables

### Backend (Render)
| Variable | Status |
|---|---|
| `MONGO_URI` | ☐ Production Atlas cluster |
| `JWT_SECRET` | ☐ Long random secret (≥32 chars) |
| `STRIPE_SECRET_KEY` | ☐ Live key (`sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | ☐ Live webhook secret |
| `STRIPE_SUBSCRIPTION_PRICE_ID` | ☐ Live Price ID |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | ☐ Production OAuth credentials |
| `GOOGLE_CALLBACK_URL` | ☐ Points to production backend |
| `FRONTEND_URL` | ☐ Production frontend URL (for CORS) |
| `NEXTAUTH_SECRET` | ☐ Shared with frontend |

### Frontend (Vercel)
| Variable | Status |
|---|---|
| `NEXT_PUBLIC_API_URL` | ☐ Production backend URL |
| `NEXTAUTH_URL` | ☐ Production frontend URL |
| `NEXTAUTH_SECRET` | ☐ Shared with backend |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | ☐ Production OAuth credentials |
| `NEXT_PUBLIC_LIVE_PROVIDER_KEY` | ☐ Live streaming provider key |

## 3. Functional Smoke Tests

### Payments
- [ ] Complete a real coin purchase (small amount) via Stripe Checkout
- [ ] Confirm webhook fires and coins are credited to user account
- [ ] Complete a subscription purchase and confirm `isPremium` is set

### Gifting & Earnings
- [ ] Send a gift in a live stream
- [ ] Confirm creator receives `earningsCoins` (60% of gift value minus agency %)
- [ ] If agency active: confirm agency creator receives `agencyEarningsCoins`

### Payouts
- [ ] Creator requests payout (balance ≥ 100 coins)
- [ ] Admin panel → `/admin/payouts` shows the request
- [ ] Admin approves the request → status moves to `approved`
- [ ] Funds are transferred externally (bank/PayPal/etc.)
- [ ] Admin marks as paid → status moves to `paid`
- [ ] Test rejection: admin rejects → coins restored to creator's `earningsCoins`

### Anti-fraud Checks
- [ ] Suspended creator cannot request payout
- [ ] Creator with balance < 100 cannot request payout
- [ ] Creator with existing pending/approved payout cannot submit a second request
- [ ] Sub-creator without accepted agreement does NOT receive agency commission

### Admin Panel
- [ ] Admin can log in at `/admin/login`
- [ ] Creator request list loads and approve/reject works
- [ ] Payout list at `/admin/payouts` loads with correct data
- [ ] Agency list at `/admin/agencies` loads correctly

## 4. Security
- [ ] All API endpoints behind `verifyToken` middleware (no unprotected write routes)
- [ ] Admin routes behind `requireAdmin` middleware
- [ ] Stripe webhook verifies signature before processing
- [ ] No secrets committed to git history
- [ ] CORS allows only `FRONTEND_URL` and `*.vercel.app`

## 5. Monitoring
- [ ] Render service health check is green
- [ ] MongoDB Atlas cluster usage is within limits
- [ ] Error logging is active (console logs visible in Render dashboard)

---

> **Note:** Payouts are processed **manually** for now. The admin team must:
> 1. Review the request at `/admin/payouts`
> 2. Approve it
> 3. Transfer funds via external method
> 4. Mark as paid in the admin panel
