# Apple In-App Purchase (StoreKit 2) — Coins purchases on iOS (setup & rollout)

Status: **implemented, NOT enabled for real purchases yet.** Crediting Coins
through this flow requires the App Store Server API credentials below to be
configured in the backend's environment. Until then,
`POST /api/payments/coins/apple` returns `503` and no purchase can be
credited. Nothing here affects Stripe web/Android, Google Play Billing, or
Sign in with Apple, which are all unchanged.

## 1. Product IDs (do not change, do not add more)

Create exactly these three **Consumable** in-app purchases in App Store
Connect → your app → Monetization → In-App Purchases, for bundle id
`com.meetyoulive.app`. These IDs are hardcoded as the single source of truth
on both ends (`backend/src/controllers/coins.controller.js`
`COIN_PACKAGES[].appleProductId` and `frontend/lib/appleStoreKit.js`
`COIN_PACKAGE_PRODUCT_IDS`) — and intentionally match the Google Play
product IDs for cross-store consistency:

| Product ID       | Coins | Price (USD, reference) |
|------------------|-------|-------------------------|
| `coins_pack_100` | 100   | $4.99                   |
| `coins_pack_250` | 250   | $9.99                   |
| `coins_pack_700` | 700   | $19.99                  |

Set each product's price per-territory using App Store Connect's pricing
tiers. The iOS app always displays **StoreKit's own localized price** at
checkout (via `Product.products(for:)`), never a hardcoded value — so App
Store Connect pricing is the actual source of truth for what the user sees
on iOS.

Mark every product as a **Consumable**, submit them for review alongside (or
ahead of) the first build that offers them, and never reuse these IDs for
anything else.

## 2. In-App Purchase API key (server-side validation)

This is a **separate** key from Sign in with Apple's credentials.

1. In [App Store Connect](https://appstoreconnect.apple.com) → **Users and
   Access** → **Integrations** → **In-App Purchase**, generate a new API
   key scoped to In-App Purchase. Download the `.p8` private key file
   **once** (Apple will not let you download it again) and note the **Key
   ID** and **Issuer ID**.
2. Note your app's **Apple ID** (the numeric App Store Connect app id,
   visible in App Information) — required only for the `PRODUCTION`
   environment.
3. Set these backend environment variables (Render → environment):
   - `APPLE_IAP_BUNDLE_ID=com.meetyoulive.app`
   - `APPLE_IAP_ENVIRONMENT=sandbox` (use `production` only once ready for
     real purchases)
   - `APPLE_IAP_APP_APPLE_ID=<numeric App Store Connect app id>`
   - `APPLE_IAP_KEY_ID=<Key ID from the .p8 key>`
   - `APPLE_IAP_ISSUER_ID=<Issuer ID from App Store Connect>`
   - `APPLE_IAP_PRIVATE_KEY=<contents of the .p8 file, as-is>` (paste as-is;
     `\n` line endings are normalized automatically, same convention as
     `FCM_PRIVATE_KEY`/`GOOGLE_PLAY_PRIVATE_KEY`)
   - `APPLE_IAP_ROOT_CERTS_BASE64=<see below>`

**Never** put this API key in the frontend, the iOS app, or any
client-reachable config. It is read only by
`backend/src/services/appleStoreKit.service.js`.

Until all required variables are set, `isConfigured()` returns `false` and
the verification endpoint responds `503` without ever crediting Coins.

### Root certificates (`APPLE_IAP_ROOT_CERTS_BASE64`)

`@apple/app-store-server-library`'s `SignedDataVerifier` needs Apple's Root
CA certificate(s) to validate the JWS signature chain on every transaction.
This repository does **not** bundle the certificate (it is a binary file
best fetched directly from Apple rather than committed), so it must be
provided via this environment variable instead:

1. Download the current Apple Root CA certificate(s) from
   <https://www.apple.com/certificateauthority/> (look for "Apple Root CA -
   G3" for StoreKit 2; Apple may list more than one valid root — include
   all of them if so).
2. For each `.cer` file, base64-encode it, e.g.:
   ```bash
   base64 -i AppleRootCA-G3.cer | tr -d '\n'
   ```
3. Set `APPLE_IAP_ROOT_CERTS_BASE64` to the base64 string. If you have more
   than one root certificate, join them with a comma (`,`) — no spaces.

## 3. What ships in this PR (and what is intentionally NOT done)

- `AppleIAPPlugin.swift` (new Capacitor plugin, registered in
  `MeetYouLiveBridgeViewController.capacitorDidLoad()` alongside the
  existing `AppleSignInPlugin`) — launches StoreKit 2's native purchase
  sheet, queries localized product prices, and recovers pending/unfinished
  transactions. It never grants Coins itself, and never finishes a
  transaction until the backend confirms the credit.
- `frontend/lib/appleStoreKit.js` — JS wrapper; `frontend/app/coins/page.jsx`
  now branches to the native flow only when running inside the iOS app
  (`isIOSNativeBillingAvailable()`); Stripe Checkout stays blocked inside
  native apps exactly as before (`mobilePayments.js`, unchanged).
- `frontend/lib/appleAccountToken.js` / `backend/src/services/appleAccountToken.service.js`
  — deterministically derive the UUID StoreKit requires as
  `appAccountToken` from the authenticated backend user id (UUID v5, fixed
  namespace shared verbatim on both sides). This replaces Google Play's
  arbitrary-string `obfuscatedAccountId` with the UUID StoreKit requires,
  while keeping the same account-binding security property.
- `POST /api/payments/coins/apple` (new route) — validates the transaction
  against the App Store Server API (`getTransactionInfo` +
  `SignedDataVerifier.verifyAndDecodeTransaction`), credits Coins atomically
  and idempotently (unique index on
  `CoinTransaction.metadata.appleTransactionId`, same pattern as the
  existing Stripe webhook, Google Play purchase route, and daily-reward
  claim).
- `backend/src/services/stripeReconciliation.service.js` and
  `backend/src/services/adminCoinEconomyControl.service.js` updated so
  Apple IAP purchases are recognized by their own `apple_iap` platform tag
  instead of being misreported as unresolved Stripe discrepancies.
- **No IPA is built or uploaded by this PR.** A human must build/sign/
  upload a release build through the existing iOS release pipeline once
  this is ready to test.
- **No purchases are enabled yet** — see the "Rollout checklist" below for
  what must happen before this goes live, even in Sandbox testing.

## 4. Purchase flow (end-to-end)

1. User taps a package on `/coins` while on the native iOS app.
2. The client derives `appAccountToken` from the authenticated user id
   (`deriveAppAccountToken`) and calls `AppleIAPPlugin.purchase()`, which
   launches StoreKit 2's purchase sheet via `Product.purchase(options:
   [.appAccountToken(...)])`.
3. On success, the client receives a `transactionId` (left **unfinished**
   client-side) and POSTs `{ productId, transactionId }` to the backend.
   **No price or coin amount is ever sent by the client.**
4. The backend calls `AppStoreServerAPIClient.getTransactionInfo(transactionId)`
   and independently verifies the returned JWS via
   `SignedDataVerifier.verifyAndDecodeTransaction()` — the only trusted
   source for `productId`/`type`/`quantity`/`appAccountToken`/
   `revocationDate`. A request is rejected if:
   - the product isn't one of the three known packages,
   - the transaction's `type` isn't `Consumable`,
   - the `quantity` isn't exactly `1`,
   - `appAccountToken` is missing or doesn't match the authenticated user,
   - the transaction has a `revocationDate`/`revocationReason` (refunded).
5. Coins are credited inside a single MongoDB transaction keyed by the
   transaction's unique `transactionId`, so retries/duplicates/concurrent
   requests can never double-credit.
6. Once the backend confirms a fully-credited response, the client calls
   `AppleIAPPlugin.finishTransaction()` so StoreKit stops re-delivering it.
   Unlike Google Play, Apple has no separate server-side "consume" call —
   the transaction's existence via `getTransactionInfo()` is itself the
   durable proof, so there is nothing else to finalize server-side.
7. On every app start, `restorePendingAppleCoinsPurchases()` asks StoreKit
   for any transaction still unfinished on the device (e.g. the app was
   killed mid-flow) and resubmits it to step 4 — safe because of the same
   idempotent credit in step 5.

## 5. Rollout checklist (manual, pending human action)

- [ ] Confirm the Paid Applications Agreement / banking & tax info in App
      Store Connect is complete — Apple will not release funds or allow
      production purchases otherwise.
- [ ] Create the three Consumable products above in App Store Connect
      exactly as specified, and submit them for review.
- [ ] Generate the In-App Purchase API key and set the `APPLE_IAP_*` backend
      env vars (including the base64 root cert(s)) in the real deploy
      environment (Render).
- [ ] Add one or more Sandbox testers (App Store Connect → **Users and
      Access** → **Sandbox Testers**) so purchases can be tested without
      real charges, and set `APPLE_IAP_ENVIRONMENT=sandbox` for that
      testing window.
- [ ] Build/sign a new build (not part of this PR) with the updated Xcode
      project and distribute it via TestFlight.
- [ ] From a Sandbox/TestFlight build, exercise: a normal purchase, a
      canceled purchase, a repeat purchase of the same pack, and a
      force-killed app mid-purchase (to exercise the pending-transaction
      recovery path).
- [ ] Only after the above is verified, set `APPLE_IAP_ENVIRONMENT=production`
      and consider promoting to a wider release. This PR does not publish or
      promote anything.
