# Google Play Billing — Coins purchases on Android (setup & rollout)

Status: **implemented, NOT enabled for real purchases yet.** Crediting Coins
through this flow requires the Google Play Developer API credentials below
to be configured in the backend's environment. Until then,
`POST /api/payments/coins/google-play` returns `503` and no purchase can be
credited. Nothing here affects Stripe web/iOS, which are unchanged.

> **V2 migration note:** Purchase verification now calls the documented
> `purchases.productsv2.getproductpurchasev2` endpoint instead of the legacy
> `purchases.products.get`. This is a technical correction recommended by
> Google for one-time product verification; it is **not** confirmed to be
> the cause of any specific prior `404 No application was found for the
> given package name` error observed in production — that must still be
> re-tested end-to-end (license-tester purchase → verify → credit → consume)
> before being declared fixed. `purchases.products.consume` (the consume
> call) is unchanged, since Google has no V2 equivalent for it.

## 1. Product IDs (do not change, do not add more)

Create exactly these three **managed/one-time, consumable** in-app products
in Play Console → your app → Monetize → Products → In-app products, for
package `com.meetyoulive.app`. These IDs are hardcoded as the single source
of truth on both ends (`backend/src/controllers/coins.controller.js`
`COIN_PACKAGES[].googlePlayProductId` and
`frontend/lib/googlePlayBilling.js` `COIN_PACKAGE_PRODUCT_IDS`):

| Product ID       | Coins | Price (USD, reference) |
|------------------|-------|-------------------------|
| `coins_pack_100` | 100   | $4.99                   |
| `coins_pack_250` | 250   | $9.99                   |
| `coins_pack_700` | 700   | $19.99                  |

Set each product's price per-country the same way the Play Console pricing
template normally works. The Android app always displays **Google Play's own
localized price** at checkout (via `queryProductDetails`/`ProductDetails`),
never a hardcoded value — so Play Console pricing is the actual source of
truth for what the user sees on Android.

Mark every product **active**. Do not reuse these IDs for anything else.

## 2. Service account for the Google Play Developer API (server-side validation)

This is a **separate** service account from the Firebase/FCM one already in
use.

1. In [Google Play Console](https://play.google.com/console) → **Users and
   permissions** → **Invite new users**, create (or link) a service account
   via the Google Cloud Console link Play Console provides.
2. Grant it, scoped to this app only:
   - **View financial data** (required to read purchase state)
   - **Manage orders and subscriptions** (required to call `purchases.products.consume`)
3. In Google Cloud Console, create a JSON key for that service account and
   extract `client_email` and `private_key`.
4. Set these backend environment variables (Render → environment):
   - `GOOGLE_PLAY_PACKAGE_NAME=com.meetyoulive.app`
   - `GOOGLE_PLAY_CLIENT_EMAIL=<client_email from the JSON key>`
   - `GOOGLE_PLAY_PRIVATE_KEY=<private_key from the JSON key>` (paste as-is;
     `\n` line endings are normalized automatically, same convention as
     `FCM_PRIVATE_KEY`)

**Never** put this service account's key in the frontend, the Android app, or
any client-reachable config. It is read only by
`backend/src/services/googlePlayBilling.service.js`.

Until all three variables are set, `isConfigured()` returns `false` and the
verification endpoint responds `503` without ever crediting Coins.

## 3. What ships in this PR (and what is intentionally NOT done)

- `com.android.vending.BILLING` permission declared in
  `frontend/android/app/src/main/AndroidManifest.xml` (also bundled by the
  Billing Library AAR itself — both are harmless together).
- `com.android.billingclient:billing:8.0.0` added to
  `frontend/android/app/build.gradle`.
- `GooglePlayBillingPlugin.java` (new Capacitor plugin, registered in
  `MainActivity.java`) — launches the native purchase sheet, queries
  localized product prices, and recovers pending/unconsumed purchases. It
  never grants Coins itself.
- `frontend/lib/googlePlayBilling.js` — JS wrapper; `frontend/app/coins/page.jsx`
  now branches to the native flow only when running inside the Android app
  (`isAndroidNativeBillingAvailable()`); Stripe Checkout stays blocked inside
  native apps exactly as before (`mobilePayments.js`, unchanged).
- `POST /api/payments/coins/google-play` (new route) — validates the
  purchase against the Google Play Developer API, credits Coins atomically
  and idempotently (unique index on `CoinTransaction.metadata.purchaseToken`,
  same pattern as the existing Stripe webhook and daily-reward claim), then
  consumes the purchase server-side so it can be repurchased.
- **No AAB is built or uploaded by this PR.** A human must build/sign/upload
  a release AAB through the existing Android release pipeline once this is
  ready to test.
- **No purchases are enabled yet** — see the "Rollout checklist" below for
  what must happen before this goes live, even in internal testing.

## 4. Purchase flow (end-to-end)

1. User taps a package on `/coins` while on the native Android app.
2. `GooglePlayBillingPlugin.purchase()` launches Google Play's purchase
   sheet, binding the purchase to the authenticated user via
   `setObfuscatedAccountId(session.user.id)`.
3. On success, the client receives an opaque `purchaseToken` and POSTs
   `{ productId, purchaseToken }` to the backend. **No price or coin amount
   is ever sent by the client.**
4. The backend calls `purchases.productsv2.getproductpurchasev2` (the Google-
   documented/recommended endpoint for one-time product verification,
   `GET /purchases/productsv2/tokens/{purchaseToken}`) — the only trusted
   source for `purchaseStateContext.purchaseState`/`productLineItem`/
   `obfuscatedExternalAccountId`. A request is rejected if:
   - the product isn't one of the three known packages,
   - the response's `productLineItem` is missing, has more than one entry,
     or doesn't match the requested product exactly,
   - the line item's quantity isn't exactly `1`,
   - the purchase isn't in the `PURCHASED` state (`PENDING`/`CANCELLED`/
     absent/unrecognized all fail closed),
   - `refundableQuantity` has dropped to `0` (refunded/revoked),
   - `obfuscatedExternalAccountId` doesn't match the authenticated user.
5. Coins are credited inside a single MongoDB transaction keyed by the
   purchase's unique `purchaseToken`, so retries/duplicates/concurrent
   requests can never double-credit.
6. The backend calls `purchases.products.consume` so Google finalizes the
   purchase and the same pack becomes purchasable again. This happens only
   **after** coins are durably credited; a consume failure is logged but
   never un-credits coins or fails the request.
7. On every app start, `restorePendingGooglePlayCoinsPurchases()` asks
   Google Play for any purchase still outstanding on the device (e.g. the
   app was killed mid-flow) and resubmits it to step 4 — safe because of the
   same idempotent credit in step 5.

## 5. Rollout checklist (manual, pending human action)

- [ ] Confirm the Play Console merchant/bank verification (mentioned as
      pending in the task) is complete — Google will not release funds or
      allow production purchases otherwise.
- [ ] Create the three products above in Play Console exactly as specified.
- [ ] Create the service account and set the three `GOOGLE_PLAY_*` backend
      env vars in the real deploy environment (Render).
- [ ] Add one or more license testers (Play Console → **Setup** → **License
      testing**) so purchases can be tested without real charges.
- [ ] Build/sign a new AAB (not part of this PR) with the updated manifest
      and upload it to an **Internal testing** track.
- [ ] From an internal-testing device, exercise: a normal purchase, a
      canceled purchase, a repeat purchase of the same pack, and a
      force-killed app mid-purchase (to exercise the pending-purchase
      recovery path).
- [ ] Only after the above is verified, consider promoting to a wider track.
      This PR does not publish or promote anything.
