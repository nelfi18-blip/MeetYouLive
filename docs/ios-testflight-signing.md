# iOS Build Preparation and TestFlight Signing

This repository contains a Capacitor/Xcode project at `frontend/ios/App`
for bundle ID `com.meetyoulive.app`. Source reviewed: `main` at `4754ff0a`
on 2026-11-04. This documentation update does not build, sign or upload anything.

## Verified build and transfer evidence

| State | Evidence / remaining gate |
|---|---|
| Implemented in code | Separate unsigned validation, manually authorized signed archive/export, and manual transfer of an existing IPA; native Apple auth and StoreKit plugins. |
| Actually generated | [2026-11-03 build run 41736924679](https://github.com/nelfi18-blip/MeetYouLive/actions/runs/41736924679), source `6e8c860d`: unsigned validation, signed archive, export and artifact-upload steps succeeded. Artifact: `MeetYouLive-ios-ipa-65` (8,708,640 bytes when inspected). |
| Actually transferred | [Upload run 41738323895](https://github.com/nelfi18-blip/MeetYouLive/actions/runs/41738323895) validated an existing IPA and `altool` returned `No errors uploading`. This is transfer evidence only. |
| External configuration not revalidated | Current signing profiles/secrets, IAP products/API access, isolated backend/database and physical-iPhone auth/purchase acceptance. Historical signing success does not verify current IAP credentials. |
| Approval not verified | Apple processing/validation, tester availability, Beta App Review, App Review and public release. None is established by a green GitHub run. |

`65` is the workflow artifact suffix, not independently verified here as
`CFBundleVersion`. The earlier owner handoff reported version 1.0 build 3
submitted on November 2; its current Apple review status was not inspected.
Do not cancel, replace or resubmit any Apple build based on that historical note.
Artifacts may expire; recheck availability before any separately authorized use.

The `iOS Build Preparation` GitHub Actions workflow
(`.github/workflows/ios-build.yml`) runs on a macOS runner and is split into
two independent jobs:

### Job 1 — `validate-unsigned-build` (always runs)

Runs on every matching `pull_request` and on every `workflow_dispatch` run,
regardless of inputs. It:

1. Installs Node dependencies and runs `npx cap sync ios` to regenerate the
   gitignored Capacitor files the Xcode project needs.
2. Validates the bundle identifier, the 1024×1024 `AppIcon.appiconset` icon,
   `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`, and that code signing is
   set to `Automatic` in the Xcode project.
3. Installs CocoaPods dependencies (`pod install`).
4. Runs an **unsigned** validation build (`CODE_SIGNING_ALLOWED=NO`) so matching
   pull requests check whether the project compiles on macOS.
5. Reports the real `xcodebuild` outcome (succeeded/failed/skipped) in the
   job summary. It never says the build "completed" unless the build step
   actually succeeded.

This job never reads any Apple signing secret, never imports a certificate
or provisioning profile, and never produces an IPA — it has no access to
the secrets at all (they are not declared in its `env:`).

### Job 2 — `signed-archive-export` (manual, explicitly authorized only)

This job only runs when **all** of the following are true:

- The run is a `workflow_dispatch` run (never `pull_request`).
- The operator set the `authorize_signed_build` input to `true` when
  triggering the run (it defaults to `false`).
- Job 1 (`validate-unsigned-build`) succeeded.

Even then, it still checks that all four Apple signing secrets listed below
are configured and skips the signing steps (reporting exactly which secret
is missing in the job summary) if any are absent. When it does run, it
imports the distribution certificate and provisioning profile into a
temporary keychain, archives the app, and exports a signed `.ipa` for App
Store distribution as a workflow artifact. It never uploads the `.ipa` to
App Store Connect.

## Owner-reported Apple configuration (not revalidated)

The earlier owner handoff reported enabling Sign in with Apple for the Primary App ID
`com.meetyoulive.app`, Team `9TXRWX685Z` (MeetYouLive Technologies LLC),
regenerating the **MeetYouLive App Store Distribution** profile, and updating
`APPLE_PROVISIONING_PROFILE_BASE64`. Current console settings and secret values
were not inspected. This native identity-token flow does not require a web
Services ID or Apple OAuth client secret; signing and IAP credentials are separate
requirements, not completed configuration inferred from the source.
Push, Associated Domains, signing settings, versions and Android distribution
are unchanged by the Apple implementation.

## Native Sign in with Apple

The iOS-only `MeetYouLiveAppleAuth` Capacitor plugin uses
`ASAuthorizationAppleIDProvider` / AuthenticationServices, with email and
full-name scopes. Login and register show a black/white Apple-branded button
only when running iOS **and the plugin is installed**. Existing shells,
without this plugin, do not show a nonfunctional button.
No Apple web/Android OAuth or NextAuth Apple provider is registered.

The installed Capgo Apple provider remains disabled: its implementation
persists Apple identity tokens in UserDefaults and prints credential data.
The app-owned bridge keeps credentials in memory only, checks returned state,
and does not request/store access or refresh tokens. iOS bridge logging is
disabled because Capacitor diagnostics can otherwise print plugin payloads.

1. `POST /api/auth/apple-challenge` creates independent random challenge ID
   and nonce values, valid for five minutes. MongoDB stores only the nonce
   digest, with a TTL index.
2. The native request passes the nonce and challenge ID as state. JavaScript
   sends the returned identity token to `POST /api/auth/apple-native` over
   HTTPS, never in URLs or logs.
3. Express validates RS256 signatures using Apple's fixed HTTPS JWKS endpoint,
   with cached keys, bounded refresh and timeout. It requires issuer
   `https://appleid.apple.com`, audience exactly `com.meetyoulive.app`,
   expiration, recent issuance, a nonempty stable `sub`, and the challenge's
   nonce. Atomic challenge deletion prevents concurrent/repeated exchanges.
   An expired challenge fails even if MongoDB TTL cleanup has not run.
4. Users resolve **only by `appleSub`**, enforced by a partial unique index.
   A concurrent registration resolves to that same subject, never to an
   email match. Existing local/Google/other Apple email collisions return
   `APPLE_ACCOUNT_CONFLICT` without linking accounts. Google entry points
   also refuse to claim an Apple account by email. Account linking is not
   offered; use the existing account's original sign-in method.
5. First registration requires a verified email from the signed token and
   explicit 18+ consent. Login has no permanent age checkbox: it first sends
   `ageConfirmed: false`. Existing Apple accounts enter without repeating
   registration consent. For an unknown subject, the backend consumes the
   challenge and returns `APPLE_REGISTRATION_REQUIRED` without creating a
   user or issuing a JWT. Only then does login show a clearly labelled
   registration step with an unchecked 18+ checkbox, terms/privacy links
   and a cancel action. After explicit consent, "Create account with Apple"
   starts a **new native authorization and challenge**; the previous Apple
   credential is never retained or reused. Cancelling resets consent.
   Register continues to use its existing age checkbox without duplicating
   it. Known underage accounts still fail with `APPLE_AGE_REQUIRED`, not a
   registration invitation. Apple private relay addresses are accepted. Later
   logins need neither email nor name; stored profile data is preserved.
   Unknown subjects without a verified email fail explicitly. Consent is
   not identity/age verification: normal onboarding still requires an adult
   birthdate and all existing profile/authenticity checks. Blocked, suspended
   and known underage accounts receive no JWT.
6. Successful login issues the existing 30-day MeetYouLive JWT and safe user
   response. The frontend uses `setToken`, native session persistence, the
   existing session-restored event, and existing admin/onboarding/callback
   routing. No Apple tokens are persisted. Referral/agency invite context is
   retained for registrations.

### Configuration and review gates

Use the existing `MONGO_URI`, `JWT_SECRET` and HTTPS `NEXT_PUBLIC_API_URL`.
The backend needs outbound HTTPS access to `appleid.apple.com/auth/keys`
and permission to create the `AppleAuthChallenge` collection and indexes.
`User.init()` waits for the unique subject index before Apple authentication.
If automatic indexing is disabled by deployment policy, an operator must
create the schema's partial unique `appleSub` index and challenge TTL index
before enabling this flow. No additional secret is required.

Native acceptance requires an installed binary containing the plugin and
entitlement. Historical build/transfer evidence above does not replace that
test. On matching PR paths the build workflow validates unsigned code; signed
archive/export and TestFlight transfer are separate manual actions. Do not
dispatch either as part of documentation or ordinary regression checks.

### Validation and real-iPhone checklist

Automated tests use synthetic RSA-signed credentials and mocked Apple JWKS,
not Apple Accounts. The real-MongoDB suite checks unique subjects, concurrent
first registration, atomic replay rejection and email-collision protection.
It runs in CI against the existing disposable local integration container.

```bash
cd backend
npm test -- --runInBand src/routes/__tests__/auth.apple-native.test.js src/services/__tests__/appleAuth.service.test.js
# Only a disposable localhost database; never production/Atlas:
INTEGRATION_MONGO_URI='mongodb://127.0.0.1:27117/meetyoulive_test?replicaSet=rs0&directConnection=true' \
  npm test -- --runInBand src/routes/__tests__/auth.apple-native.integration.test.js
cd ../frontend
node --test tests/apple-native-auth.test.mjs tests/mobile-native.test.mjs tests/i18n-key-parity.test.mjs
npm run lint
npm run build
```

Physical-device acceptance is **not verified in this documentation review**.
Use a separately authorized test binary and dedicated iPhone. Verify the system sheet, state/nonce,
first registration (shared email and Hide My Email using dedicated test
accounts), later login without name/email, cancellation, blocked/underage
accounts, session persistence/reopen/logout/account switching, and final
admin/onboarding/callback navigation. Check the button at mobile sizes in
Spanish, English and Portuguese, and ensure native/device logs contain no
Apple credentials. Recheck Google and email login and the existing Android
browser handoff. An unsigned CI build or simulated bridge test does not
complete this iPhone acceptance gate.

### Isolated frontend + backend for the future iPhone test

**Historical handoff (November 3, 2026), not revalidated here:** the earlier
guide reported a Vercel frontend preview and historical
`Preview – meetyoulive-backend` deployments. Those backend refs are not the
Apple branch. Environment-variable access was denied by the session token;
neither an up-to-date backend nor an isolated database could be verified.
`render.yaml` defines only the existing production API, not staging. The
committed `frontend/.env.production` defaults both API URLs to production.
Therefore **do not use the PR preview for Apple acceptance merely because
its frontend build is green**. No Render/Vercel configuration, service,
environment, DNS, paid resource or secret was created/changed for this work.

An owner may reuse an **already available** staging pair only after verifying
both deployed SHAs, its nonproduction MongoDB URI, independent JWT/internal
secrets, disabled real integrations, exact CORS origin and frontend
`NEXT_PUBLIC_API_URL`/`API_URL`. Unknown isolation means stop; do not create
another service or change Preview variables without authorization.

The earlier guide also reported a local Express/Next smoke test against
disposable MongoDB and a nonproduction API URL. That test was not independently
rerun during this review and is not physical-device acceptance evidence.
The LAN TLS/root-trust and iPhone steps below remain **unverified**; automated
handler/JWKS tests do not perform native Apple login.

**No-cloud fallback: a Mac, an isolated local MongoDB and LAN-only HTTPS.**
Use a dedicated test iPhone/Apple Account, no existing customer account,
no production export/backup, and no production environment files or keys.
This plan does not require provisioning a cloud service or a public tunnel.
It is a future operator procedure, **not an iPhone test already performed**.

1. Use a fresh checkout of the reviewed `main` commit on the Mac; record
   `git rev-parse HEAD`. Frontend, backend and native project must use that
   same commit. Check there is no `.env`, `.env.local` or copied production
   credential file. Use Node 24 and `npm ci` in both package directories.
   Do not run `docker-compose.yml`: it mounts a reusable database volume and
   reads unspecified `.env` files.
2. Prerequisites: Docker, Xcode/CocoaPods, and an existing local TLS/reverse
   proxy toolchain (example: mkcert and Caddy). If missing, ask the operator
   before installation or any infrastructure change. On the Mac choose its
   private LAN IPv4 address (example below; replace it), a trusted network
   shared with the iPhone, and unused ports. No router port forwarding.

   ```bash
   export TEST_LAN_IP=192.168.1.50
   export TEST_WEB_URL="https://${TEST_LAN_IP}:8443"
   export TEST_API_URL="https://${TEST_LAN_IP}:9443"
   export TEST_JWT="$(node -p "require('crypto').randomBytes(32).toString('hex')")"
   export TEST_INTERNAL="$(node -p "require('crypto').randomBytes(32).toString('hex')")"
   export TEST_NEXTAUTH="$(node -p "require('crypto').randomBytes(32).toString('hex')")"
   ```

3. Check `docker info` first; use the operator's existing Docker daemon.
   Start a disposable database without a host directory/volume, published
   **only on loopback**, never Atlas or the existing shared database:

   ```bash
   docker run --rm --name myl-apple-iphone-test \
     -p 127.0.0.1:27119:27017 mongo:6 --replSet rs0 --bind_ip_all
   # Separate terminal; verify ready before starting the API:
   docker exec myl-apple-iphone-test mongosh --quiet \
     --eval 'db.adminCommand({ping:1}).ok'
   docker exec myl-apple-iphone-test mongosh --quiet \
     --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]})"
   # Wait until this returns 1 (PRIMARY) before running transactional paths:
   docker exec myl-apple-iphone-test mongosh --quiet --eval 'rs.status().myState'
   ```

4. Start the branch backend in a clean environment (from `backend/`).
   It sees only a new local database and generated **test-only** secrets.
   Google/Stripe placeholders below only allow module initialization;
   they are not valid credentials. No SMTP, Firebase, Sentry, billing,
   push or other production integration is configured. Do not exercise
   payments, notifications or other external integrations in this session.

   ```bash
   env -i HOME="$HOME" PATH="$PATH" NODE_ENV=development PORT=10019 \
     MONGO_URI='mongodb://127.0.0.1:27119/meetyoulive_apple_iphone_test?replicaSet=rs0&directConnection=true' \
     JWT_SECRET="$TEST_JWT" INTERNAL_API_SECRET="$TEST_INTERNAL" \
     FRONTEND_URL="$TEST_WEB_URL" \
     GOOGLE_CLIENT_ID=local-test-placeholder \
     GOOGLE_CLIENT_SECRET=local-test-placeholder \
     GOOGLE_CALLBACK_URL="$TEST_API_URL/api/auth/google/callback" \
     STRIPE_SECRET_KEY=sk_test_local_disabled \
     node index.js
   ```

5. In another terminal, with the same test variables exported, build/start
   the frontend (from `frontend/`). **Set both API variables at build time**;
   changing only `NEXT_PUBLIC_APP_URL` or a runtime variable is insufficient.
   Explicit values override the committed production defaults.

   ```bash
   env -i HOME="$HOME" PATH="$PATH" NEXT_TELEMETRY_DISABLED=1 \
     NEXT_PUBLIC_API_URL="$TEST_API_URL" API_URL="$TEST_API_URL" \
     NEXTAUTH_URL="$TEST_WEB_URL" NEXTAUTH_SECRET="$TEST_NEXTAUTH" \
     INTERNAL_API_SECRET="$TEST_INTERNAL" npm run build
   env -i HOME="$HOME" PATH="$PATH" \
     NEXT_PUBLIC_API_URL="$TEST_API_URL" API_URL="$TEST_API_URL" \
     NEXTAUTH_URL="$TEST_WEB_URL" NEXTAUTH_SECRET="$TEST_NEXTAUTH" \
     INTERNAL_API_SECRET="$TEST_INTERNAL" \
     npm start -- --hostname 127.0.0.1 --port 30019
   ```

6. Serve **both** processes over trusted LAN HTTPS. With operator-approved
   mkcert, create a local certificate for `$TEST_LAN_IP` and trust its local
   root on the Mac and the dedicated iPhone (enable certificate full trust
   in iOS settings). This is a local TLS certificate, **not** an Apple
   signing certificate/profile. Never transfer its CA private key to the
   phone, commit it, or bypass TLS validation/ATS. Keep TLS files and a
   Caddyfile outside the checkout. Example Caddyfile (replace cert paths):

   ```caddyfile
   {
     admin off
     auto_https off
   }
   https://{$TEST_LAN_IP}:8443 {
     bind {$TEST_LAN_IP}
     tls /absolute/test-only/lan.pem /absolute/test-only/lan-key.pem
     reverse_proxy 127.0.0.1:30019
   }
   https://{$TEST_LAN_IP}:9443 {
     bind {$TEST_LAN_IP}
     tls /absolute/test-only/lan.pem /absolute/test-only/lan-key.pem
     reverse_proxy 127.0.0.1:10019
   }
   ```

   Run `caddy run --config /absolute/test-only/Caddyfile`. Firewall the
   backend's port 10019 to loopback (the existing Express entry binds
   0.0.0.0); allow only the dedicated phone to the two TLS ports. Do not
   expose MongoDB, the upstream HTTP ports, or a public tunnel.
7. Preflight **before Apple authorization**:
   - Verify `curl "$TEST_API_URL/api/health"` and open
     `$TEST_WEB_URL/login` in iPhone Safari with no certificate warning.
   - `POST "$TEST_API_URL/api/auth/apple-challenge"` must return a challenge
     on this **local** API; a deliberately invalid token to `apple-native`
     must fail with no JWT. Do not print or save actual Apple credentials.
   - Check the API's CORS preflight using `Origin: $TEST_WEB_URL`; it must
     allow that exact origin. Confirm that the compiled JS/network requests
     use `$TEST_API_URL`, not `meetyoulive.onrender.com`.
   - Inspect the local DB: no existing users before testing; schema indexes
     include partial unique `appleSub` and the challenge TTL. After a denied
     registration without consent there must still be no new user.
   - In an isolated test network, deny outbound requests to production
     MeetYouLive/Render endpoints. Permit Apple's JWKS/system authentication
     traffic. If any production API request or redirect appears, stop.
8. Sync **iOS only**, from `frontend/`, with the nonproduction web origin:

   ```bash
   NEXT_PUBLIC_APP_URL="$TEST_WEB_URL" npx cap sync ios
   # Inspect ios/App/App/capacitor.config.json: server.url must be TEST_WEB_URL
   # and its host must be in allowNavigation. Do not sync Android.
   ```

   Do not commit the generated config, change production defaults, disable
   HTTPS, or change the bundle ID/audience. Once separately authorized, use
   Xcode **Run** on the dedicated iPhone with an existing valid development
   signing/device setup. An App Store distribution profile and unsigned CI
   artifact cannot be used for Xcode Run. If no approved device signing
   setup exists, that remains a blocker for the owner: do not create/rotate
   profiles or certificates to work around it. No archive, IPA, TestFlight
   upload, App Store build replacement, or version change is part of this
   procedure. Do not install over a customer's normal app on their phone.
9. Exercise existing-account login without a checkbox; new-account login
   must first display the conditional registration step, create no user/JWT
   before consent, then obtain a fresh Apple authorization after consent.
   Check cancel/reset, normal registration, Hide My Email, return login,
   onboarding adult birthdate, session reopen/logout, and logs without Apple
   credentials. Only dedicated test identities may appear in the local DB.
   Any Apple email/name claims missing on a new-account retry must fail
   explicitly, never use client email or auto-link another account.

This LAN plan tests Apple and relative in-app navigation, not Google OAuth
against production. Existing Google redirect URIs, native deep links and
trusted production URL policy are deliberately unchanged. Google/Android
and local login are covered by regression tests/CI. A real Google browser
handoff test additionally needs an **already authorized isolated OAuth
client/callback and native link setup**; with placeholders, stop before
external Google sign-in rather than borrowing production credentials.

After testing, stop the named test processes/container, remove only the
test-specific data/cert files and iPhone test app/root trust, clear its
stored test sessions, and discard this checkout's generated config/build
output. Never delete or change the production database, any submitted
Apple build, or shared environment settings. Record the SHA, local origins,
device/iOS version and pass/fail evidence (without credentials).

## GitHub repository secrets required for a signed build

Configure these as repository (or environment) secrets. None of them are
committed to the repository:

| Secret | Description |
|---|---|
| `APPLE_TEAM_ID` | 10-character Apple Developer Team ID. |
| `APPLE_DISTRIBUTION_CERTIFICATE_P12_BASE64` | Base64 of the exported Apple Distribution certificate `.p12` file. |
| `APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD` | Password used when exporting the `.p12` file. |
| `APPLE_PROVISIONING_PROFILE_BASE64` | Base64 of the App Store distribution `.mobileprovision` file for `com.meetyoulive.app`. |

Generate the base64 values locally (on a Mac, since `.p12` export requires
Keychain Access):

```bash
base64 DistributionCertificate.p12 > certificate.b64
base64 MeetYouLive_AppStore.mobileprovision > profile.b64
```

(macOS's built-in `base64` does not support the GNU-only `-w` flag; omitting
it is portable across macOS and Linux, and embedded line wraps do not affect
`base64 -D`/`base64 -d` decoding.)

Paste the contents of each `.b64` file into the matching GitHub secret.

## What this workflow intentionally does not do

- It does not run the signed archive/export job on `pull_request` events, or
  on a `workflow_dispatch` run that does not explicitly set
  `authorize_signed_build: true`.
- It does not upload the exported `.ipa` to App Store Connect/TestFlight.
- It does not create or rotate Apple certificates or provisioning profiles.
- It does not change `aps-environment`, associated domains, or any other
  entitlement.
- It does not touch the Android project or any backend/frontend feature
  code (OAuth, Stripe, Coins, Gifts, Live, Chat, Discover, auth).
- It does not create a new Xcode/Capacitor iOS project; it reuses
  `frontend/ios/App` as-is.

## Transfer an existing IPA (separate manual workflow)

`.github/workflows/ios-testflight-upload.yml` already implements manual transfer
on a GitHub macOS runner; access to a personal Mac is not a prerequisite for
that workflow. This is separate from `ios-build.yml`, which only generates the
signed artifact and never uploads it to Apple.

For a separately authorized transfer, explicitly select the **run ID** of a
successful manual `ios-build.yml` run on `main` and the exact, unexpired artifact
name. Do not assume the workflow's historical input defaults select the desired
build. The upload workflow checks source/artifact identity, ZIP/device-app
structure, bundle ID, version fields and signing material, then uses `altool`.
It validates Apple's JSON success response; ambiguous/failed output fails closed.

It reads these existing repository secrets only for transfer:
`APP_STORE_CONNECT_API_KEY_BASE64`, `APP_STORE_CONNECT_KEY_ID`, and
`APP_STORE_CONNECT_ISSUER_ID`. These are distinct from the four signing secrets
above and from backend `APPLE_IAP_*` purchase-verification configuration.
Current secret validity was not checked during this documentation review.

A confirmed `altool` transfer is **not** confirmation of Apple processing,
TestFlight availability, tester distribution, Beta App Review, App Review or
public release. Verify each applicable status in App Store Connect and record
the actual version/build independently. The verified historical run above
requested no new compilation or automatic tester distribution.

Transporter or a separately authorized local `altool` transfer remains an
alternative on a Mac with Xcode tools. `notarytool` is for macOS notarization,
not iOS App Store delivery. This documentation change triggers none of these actions.
