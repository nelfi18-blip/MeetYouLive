# iOS Build Preparation and TestFlight Signing

This repository ships an existing Capacitor/Xcode iOS project at
`frontend/ios/App` for bundle ID `com.meetyoulive.app`. The app is already
created in App Store Connect but has no build uploaded yet.

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

## What is still pending on Apple Developer / App Store Connect

The following must be completed in the Apple Developer account and App
Store Connect before a signed build can be produced. None of this can be
done from this sandboxed environment because it requires an enrolled Apple
Developer Program membership and Mac/Apple ID access:

1. Confirm the App ID `com.meetyoulive.app` is registered under
   **Certificates, Identifiers & Profiles** with the capabilities the app
   uses (Push Notifications, Associated Domains for `meetyoulive.net`).
2. Create an **Apple Distribution** certificate (type `Apple Distribution`,
   not the legacy `iOS Distribution`) and export it as a password-protected
   `.p12` file.
3. Create an **App Store** provisioning profile for `com.meetyoulive.app`
   linked to that distribution certificate, and download the
   `.mobileprovision` file.
4. Note the **Team ID** (10-character alphanumeric string) from the Apple
   Developer account membership page.
5. Confirm the app record for `com.meetyoulive.app` already exists in App
   Store Connect (per the task context, it does) and that the Apple ID or
   App Store Connect API Key used for any future manual upload has the
   **Developer** or **App Manager** role on it.
6. Decide the Push Notifications environment for the next TestFlight build:
   the current `App.entitlements` has `aps-environment` set to
   `development`. An App Store distribution provisioning profile requires
   `production`. This change is **not** made in this PR per the "no
   changing push permissions without evidence" constraint — update
   `frontend/ios/App/App/App.entitlements` to `production` only once the
   production APNs setup is confirmed, as a follow-up change.

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
