# Google Play Billing — Coins purchases on Android (setup & rollout)

Status (2026-11-04): **implemented in code; live configuration and Google Play
production approval are not verified.** Missing required backend credentials
make `POST /api/payments/coins/google-play` return `503`; repository configuration
checks are not a live credential/permission test. Web purchases use Stripe;
native Android uses Google Play Billing and native iOS uses StoreKit 2 when its
plugin is installed. External Stripe Checkout remains blocked in native shells.

| State | What is known |
|---|---|
| Implemented | Native plugin, backend verification, account binding, atomic/idempotent credit and pending-purchase recovery. |
| Actually tested | Provider/credit regression tests use mocked dependencies; separate real-MongoDB suites cover payouts, auth and deletion in [CI](../README.md#ci-and-reproducible-checks); no live Google Play purchase is established by those results. |
| External configuration unverified | Store products/prices, backend credentials/permissions, merchant/banking/tax setup and dedicated-device purchase/recovery acceptance. |
| Approval unverified | Store product/app approval and production availability; build/transfer success does not establish either. |

> **V2 migration note:** Purchase verification now calls the documented
> `purchases.productsv2.getproductpurchasev2` endpoint instead of the legacy
> `purchases.products.get`. This is a technical correction recommended by
> Google for one-time product verification; it is **not** confirmed to be
> the cause of any specific prior `404 No application was found for the
> given package name` error mentioned in the earlier handoff — that must still be
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

Set prices per country in Play Console. The native Google Play purchase
sheet uses the store's localized price. The `/coins` Android package cards
now query `getGooglePlayCoinPackagePrices()` and display the store's
`formattedPrice`. An unresolved product displays «—» and its buy button
stays disabled; the old hardcoded USD price and per-coin estimate are not
shown in native Android. This only changes client display/availability;
a real purchase still needs a license-tester end-to-end verification.

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

## 3. Implemented code and rollout boundary

- `com.android.vending.BILLING` permission declared in
  `frontend/android/app/src/main/AndroidManifest.xml` (also bundled by the
  Billing Library AAR itself — both are harmless together).
- `com.android.billingclient:billing:8.0.0` added to
  `frontend/android/app/build.gradle`.
- `GooglePlayBillingPlugin.java` (Capacitor plugin, registered in
  `MainActivity.java`) — launches the native purchase sheet, queries
  localized product prices, and recovers pending/unconsumed purchases. It
  never grants Coins itself.
- `frontend/lib/googlePlayBilling.js` — JS wrapper; `frontend/app/coins/page.jsx`
  now branches to the native flow only when running inside the Android app
  (`isAndroidNativeBillingAvailable()`); Stripe Checkout stays blocked inside
  native apps exactly as before (`mobilePayments.js`, unchanged).
- `POST /api/payments/coins/google-play` — validates the
  purchase against the Google Play Developer API, credits Coins atomically
  and idempotently (unique index on `CoinTransaction.metadata.purchaseToken`,
  same pattern as the existing Stripe webhook and daily-reward claim), then
  consumes the purchase server-side so it can be repurchased.
- Android build workflows exist, but a generated/signed artifact is not
  evidence of Play Console publication, billing configuration or purchase
  acceptance. This documentation update generates or uploads no AAB/APK.
- **Live purchase readiness is not verified.** Use the rollout checklist below;
  automated tests do not complete license-tester/device acceptance.

## 4. Purchase flow (end-to-end)

1. User taps a package on `/coins` while on the native Android app.
2. `GooglePlayBillingPlugin.purchase()` launches Google Play's purchase
   sheet, binding the purchase to the authenticated user via
   `setObfuscatedAccountId(accountId)`. The page resolves `accountId` from
   authenticated `GET /api/user/me` via `resolveGooglePlayAccountId`, so
   NextAuth and JWT-only sessions bind to the same backend identity.
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
6. The backend consumes the purchase only after **all** purchased Coins
   are durably credited. A balance cap produces `PURCHASE_PARTIALLY_CREDITED`
   with `fullyCredited: false`, leaving the purchase pending/unconsumed for
   later recovery of the remainder. After full credit, a consume failure
   does not reverse the credit; resubmitting the same token safely retries
   finalization without granting Coins twice.
7. On every app start, `restorePendingGooglePlayCoinsPurchases()` asks
   Google Play for any purchase still outstanding on the device (e.g. the
   app was killed mid-flow) and resubmits it to step 4 — safe because of the
   same idempotent credit in step 5.

## 5. Rollout checklist (external verification still required)

Unchecked items mean evidence was not verified in this review; they do not
prove that an external console setting is absent. Record environment, SHA,
device/store-test track and results without copying credentials or customer data.

- [ ] Verify the current Play Console merchant/banking/tax and app/product
      eligibility status; no completion or approval was verified here.
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
      This documentation update does not publish or promote anything.
