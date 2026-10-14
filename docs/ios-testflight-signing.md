# iOS Build Preparation and TestFlight Signing

This repository ships an existing Capacitor/Xcode iOS project at
`frontend/ios/App` for bundle ID `com.meetyoulive.app`. The app is already
created in App Store Connect but has no build uploaded yet.

The `iOS Build Preparation` GitHub Actions workflow
(`.github/workflows/ios-build.yml`) runs on a macOS runner and:

1. Installs Node dependencies and runs `npx cap sync ios` to regenerate the
   gitignored Capacitor files the Xcode project needs.
2. Validates the bundle identifier, the 1024×1024 `AppIcon.appiconset` icon,
   `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`, and that code signing is
   set to `Automatic` in the Xcode project.
3. Installs CocoaPods dependencies (`pod install`).
4. Runs an **unsigned** validation build (`CODE_SIGNING_ALLOWED=NO`) so every
   pull request confirms the project still compiles on macOS, without any
   Apple credentials.
5. Only if all Apple signing secrets listed below are configured, imports the
   distribution certificate and provisioning profile into a temporary
   keychain, archives the app, and exports a signed `.ipa` for App Store
   distribution as a workflow artifact.
6. Never uploads the `.ipa` to App Store Connect and never runs
   `altool`/`notarytool`/Transporter upload commands. Uploading to TestFlight
   remains a manual, separate step performed outside this workflow.

If any required secret is missing, the workflow skips the signed
archive/export steps and reports exactly which secrets are missing in the
job summary — it does not fail the unsigned validation build.

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
base64 -w 0 DistributionCertificate.p12 > certificate.b64
base64 -w 0 MeetYouLive_AppStore.mobileprovision > profile.b64
```

Paste the contents of each `.b64` file into the matching GitHub secret.

## What this workflow intentionally does not do

- It does not upload the exported `.ipa` to App Store Connect/TestFlight.
- It does not create or rotate Apple certificates or provisioning profiles.
- It does not change `aps-environment`, associated domains, or any other
  entitlement.
- It does not touch the Android project or any backend/frontend feature
  code (OAuth, Stripe, Coins, Gifts, Live, Chat, Discover, auth).
- It does not create a new Xcode/Capacitor iOS project; it reuses
  `frontend/ios/App` as-is.

## Manual steps to upload the signed build to TestFlight

Once the workflow produces the `MeetYouLive-ios-ipa-<run_number>` artifact:

1. Download the artifact and verify the `.ipa` locally.
2. Upload it with Apple's **Transporter** app, or with
   `xcrun altool --upload-app` / `xcrun notarytool submit` from a Mac you
   control, using an App Store Connect API Key or Apple ID with access to
   the app.
3. In App Store Connect, assign the build to a TestFlight group once
   processing completes.

This workflow deliberately stops before step 2 so that no automated process
publishes a build to App Store Connect.
