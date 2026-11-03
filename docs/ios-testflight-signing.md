# iOS Build Preparation and TestFlight Signing

This repository ships an existing Capacitor/Xcode iOS project at
`frontend/ios/App` for bundle ID `com.meetyoulive.app`. The app is already
created in App Store Connect. Per the owner's November 2026 handoff, iOS 1.0
build 3 was submitted to App Review on November 2. Do not cancel, replace,
rebuild, or upload it as part of the Sign in with Apple implementation.

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
4. Runs an **unsigned** validation build (`CODE_SIGNING_ALLOWED=NO`) so every
   pull request confirms the project still compiles on macOS.
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

## Existing Apple configuration (do not repeat)

The owner has already enabled Sign in with Apple for the Primary App ID
`com.meetyoulive.app`, Team `9TXRWX685Z` (MeetYouLive Technologies LLC),
regenerated the **MeetYouLive App Store Distribution** profile, and updated
`APPLE_PROVISIONING_PROFILE_BASE64`. The existing distribution certificate
is retained. No new certificates, profiles, Services ID, Apple private key,
or Apple OAuth client secret are needed for this native identity-token flow.
Push, Associated Domains, signing settings, versions and Android distribution
are unchanged by the Apple implementation.

## Native Sign in with Apple

The iOS-only `MeetYouLiveAppleAuth` Capacitor plugin uses
`ASAuthorizationAppleIDProvider` / AuthenticationServices, with email and
full-name scopes. Login and register show a black/white Apple-branded button
only when running iOS **and the plugin is installed**. Existing shells,
including build 3 without this plugin, do not show a nonfunctional button.
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
   explicit 18+ consent. Apple private relay addresses are accepted. Later
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

This code must be reviewed before any merge or production rollout. A future
native binary containing the plugin and entitlement is necessary, but is
**not produced or uploaded by this task**. The PR's iOS workflow only performs
an unsigned build; do not dispatch signed-build or TestFlight-upload workflows.

### Validation and real-iPhone checklist

Automated tests use synthetic RSA-signed credentials and mocked Apple JWKS,
not Apple Accounts. The real-MongoDB suite checks unique subjects, concurrent
first registration, atomic replay rejection and email-collision protection.
It runs in CI against the existing disposable local integration container.

```bash
cd backend
npm test -- --runInBand src/routes/__tests__/auth.apple-native.test.js src/services/__tests__/appleAuth.service.test.js
# Only a disposable localhost database; never production/Atlas:
INTEGRATION_MONGO_URI='mongodb://127.0.0.1:27117/meetyoulive_test' \
  npm test -- --runInBand src/routes/__tests__/auth.apple-native.integration.test.js
cd ../frontend
node --test tests/apple-native-auth.test.mjs tests/mobile-native.test.mjs tests/i18n-key-parity.test.mjs
npm run lint
npm run build
```

Native validation is **pending until tested on a real iPhone** with a future,
separately authorized test binary. Verify the system sheet, state/nonce,
first registration (shared email and Hide My Email using dedicated test
accounts), later login without name/email, cancellation, blocked/underage
accounts, session persistence/reopen/logout/account switching, and final
admin/onboarding/callback navigation. Check the button at mobile sizes in
Spanish, English and Portuguese, and ensure native/device logs contain no
Apple credentials. Recheck Google and email login and the existing Android
browser handoff. An unsigned CI build or simulated bridge test does not
complete this iPhone acceptance gate.

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

## Manual steps to upload the signed build to TestFlight (still pending)

Uploading is **not** part of this workflow and is **not** done in this PR.
`xcrun notarytool` is for notarizing macOS software and does not apply to
this use case (notarization is unrelated to iOS App Store/TestFlight
uploads) and is not referenced here.

Once a future, explicitly authorized run of the `signed-archive-export` job
produces the `MeetYouLive-ios-ipa-<run_number>` artifact, the currently
Apple-supported ways to deliver it to App Store Connect are:

1. **Transporter** (Apple's official GUI app, macOS only) — drag the
   downloaded `.ipa` in and upload, signed in with an Apple ID that has the
   Developer/App Manager role on the app, or
2. **`xcrun altool --upload-app`** (bundled with Xcode command line tools,
   macOS only) using an **App Store Connect API Key** (recommended over an
   Apple ID/app-specific password):
   ```bash
   xcrun altool --upload-app \
     --type ios \
     -f MeetYouLive.ipa \
     --apiKey <API_KEY_ID> \
     --apiIssuer <API_ISSUER_ID>
   ```

Both options require a macOS machine with Xcode command line tools — this
is pending because **the user does not have a Mac**. Until Mac access is
available, the practical path is to download the artifact from the
authorized `signed-archive-export` run and perform the upload from a
macOS machine the user can access temporarily (for example, a borrowed Mac,
a cloud Mac rental, or a colleague's machine), or to ask someone with Mac
access to run step 2 above using an App Store Connect API Key scoped to
this app. This workflow intentionally does not attempt any of this
automatically, per the task constraint that no build may be published or
uploaded from CI.

After upload, in App Store Connect, assign the build to a TestFlight group
once processing completes.
