# Android Firebase Push and Google Login

This repository is prepared for Android package `com.meetyoulive.app`.

## Firebase configuration

1. In Firebase Console, create/select the MeetYouLive Firebase project.
2. Add an Android app with package name `com.meetyoulive.app`.
3. Register the release keystore SHA-1 and SHA-256 fingerprints before beta testing.
4. Download `google-services.json`.
5. Place it locally at `frontend/android/app/google-services.json`.

Do not commit `google-services.json`. For GitHub Actions, store the base64 value in the repository secret:

- `ANDROID_GOOGLE_SERVICES_JSON_BASE64`

Generate it locally with:

```bash
base64 -w 0 frontend/android/app/google-services.json
```

The Android Updateable Release APK workflow reconstructs the file only during the job and removes it after `assembleRelease`. Release APK generation fails if this secret is missing so every distributed APK keeps the same Firebase configuration.

## Updateable APK signing and versioning

All APK artifacts intended for installation over an existing app must be release builds with:

- `applicationId`: `com.meetyoulive.app`
- The same release keystore in every run (`ANDROID_KEYSTORE_BASE64`)
- `versionCode` higher than the APK already installed
- An ordered `versionName`

Required GitHub Actions secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Configure these secrets from the existing Android signing keystore only. Do not
paste secret values in issues, pull requests, logs, docs, or commits.

On a trusted machine that has the previous keystore:

```bash
# Linux
base64 -w 0 /path/to/existing-release.keystore

# macOS
base64 -i /path/to/existing-release.keystore | tr -d '\n'
```

Use that single-line base64 output as `ANDROID_KEYSTORE_BASE64`. Use the
existing keystore password, existing alias, and existing key password for the
other three secrets. If the alias is unknown, list aliases locally with:

```bash
keytool -list -keystore /path/to/existing-release.keystore
```

Do not publish the command output if it contains private project details.

The workflow sets `versionCode` to the GitHub run number by default and `versionName` to `1.0.<run_number>`. For manual runs, override `version_code` only when it is greater than the installed APK's `versionCode`.

Validate an update on a device with:

```bash
adb install -r app-release.apk
```

Do not alternate these release APKs with debug APKs; debug and release builds use incompatible signing keys and Android will reject the update.

Before PR #844, repository-generated APK artifacts were Debug builds named
`MeetYouLive-debug-*` and were produced with `assembleDebug`. Those debug APKs
were signed by the debug key available in the build environment at generation
time, not by a reusable release keystore stored in this repository. If the APK
currently installed on a device came from one of those debug artifacts, a new
release keystore will not update it. Android will require the exact same
previous signing key plus a higher `versionCode`; if that private key cannot be
recovered, the first move to the new release keystore requires uninstalling once
and then future APKs signed with the same release keystore can update in place.

## Google Cloud / OAuth

Configure both OAuth clients:

- Web Client ID: used by NextAuth on the web frontend.
- Android Client ID: package `com.meetyoulive.app` plus the registered SHA fingerprints.

Google Login in the Android shell opens the system browser to the existing NextAuth Google endpoint and returns through the configured HTTPS App Link/custom scheme. Google credentials remain in the browser/NextAuth flow; the frontend receives only the existing backend JWT session.

Expected callback path:

- Web: `/api/auth/callback/google`
- Native handoff after login: `/login?callbackUrl=<target route>`

## SHA fingerprints

From `frontend/android`:

```bash
./gradlew signingReport
```

Use the `release` variant and register its SHA fingerprints in:

- Firebase Console → Project settings → Android app
- Google Cloud Console → APIs & Services → Credentials → Android OAuth Client

## Notification channels

Created by `MainActivity`:

- `messages` — high importance
- `matches` — default importance
- `calls` — high importance
- `lives` — default importance
- `account_payments` — default importance

FCM payloads map notification `data.type` to these channels. Marketing channels are intentionally not created.

## Deep links supported from notifications

Safe notification routes include:

- chat: `/chats/:id`, `/chat`
- calls: `/call/:id`, `/calls`
- live: `/live/:id`
- profile: `/profile`
- coins: `/coins`
- creator center: `/dashboard/creator`, `/creator-center`
- wallet: `/wallet`
- match: `/matches`, `/match`, `/crush`

Invalid routes fall back to `/`. Protected routes rely on the existing auth middleware/session handling.
