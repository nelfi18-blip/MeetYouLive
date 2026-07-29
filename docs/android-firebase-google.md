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

Do not paste secret values in issues, pull requests, logs, docs, comments, or
commits. The alias is also treated as a secret in this repository.

### Crear una nueva keystore Release

Use a trusted computer for this one-time setup. Android Studio is not required
after this step; Java/JDK `keytool` is enough.

1. Install a JDK if `keytool` is not available.
2. Create the Release keystore:

```bash
keytool -genkeypair -v \
  -storetype PKCS12 \
  -keystore meetyoulive-release.keystore \
  -alias meetyoulive-release \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

3. Save the passwords, alias, and `meetyoulive-release.keystore` in a private
   password manager/backed-up location. If the file or passwords are lost,
   future APKs cannot update the installed app.
4. Convert the keystore file to one Base64 line:

```bash
# Linux
base64 -w 0 meetyoulive-release.keystore > meetyoulive-release.keystore.base64

# macOS
base64 -i meetyoulive-release.keystore | tr -d '\n' > meetyoulive-release.keystore.base64

# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("meetyoulive-release.keystore")) | Set-Content -NoNewline "meetyoulive-release.keystore.base64"
```

5. Use the single-line content of `meetyoulive-release.keystore.base64` as the
   value of `ANDROID_KEYSTORE_BASE64`.

### Dónde agregar los secrets en GitHub

From a phone, open GitHub in the browser and enable the desktop site if the
settings menu is hidden.

1. Go to `https://github.com/nelfi18-blip/MeetYouLive`.
2. Open **Settings**.
3. Open **Secrets and variables**.
4. Open **Actions**.
5. In **Repository secrets**, tap **New repository secret**.
6. Create these four secrets exactly:
   - Name: `ANDROID_KEYSTORE_BASE64` / Secret: the Base64 one-line keystore.
   - Name: `ANDROID_KEYSTORE_PASSWORD` / Secret: the keystore password.
   - Name: `ANDROID_KEY_ALIAS` / Secret: the alias chosen when creating the key.
   - Name: `ANDROID_KEY_PASSWORD` / Secret: the key password.
7. Also keep `ANDROID_GOOGLE_SERVICES_JSON_BASE64` configured for the same
   repository, because Release APK generation requires Firebase config.

Never post the secret values in the PR, screenshots, public docs, issue
comments, or chat. Only the public certificate SHA-256 may be shared.

The workflow sets `versionCode` to the GitHub run number by default and `versionName` to `1.0.<run_number>`. For manual runs, override `version_code` only when it is greater than the installed APK's `versionCode`.

### Verificar que el workflow funciona

After the secrets exist:

1. Go to **Actions → Android Updateable Release APK**.
2. Run the workflow on the PR branch, or re-run the failed PR check.
3. Confirm the job reaches **Upload signed Release APK artifact**.
4. Download artifact `MeetYouLive-release-<run_number>`.
5. Confirm the artifact contains:
   - `app-release.apk`
   - `meetyoulive-release-metadata.txt`
6. Open `meetyoulive-release-metadata.txt` and confirm:
   - `applicationId=com.meetyoulive.app`
   - `versionCode=<run number or manual override>`
   - `versionName=1.0.<run number or manual override>`
   - `certificateSha256=<public SHA-256 of the signing certificate>`

Validate an update on a device with a computer that has Android platform tools:

```bash
adb install -r app-release.apk
```

If working only from a phone, download `app-release.apk` from the artifact,
open it from the phone downloads, and allow installation from the browser/file
manager. If Android says the package conflicts with an existing app, uninstall
the old Debug APK once and install the first Release APK.

Do not alternate these release APKs with debug APKs; debug and release builds use incompatible signing keys and Android will reject the update.

Before PR #844, repository-generated APK artifacts were Debug builds named
`MeetYouLive-debug-*` and were produced with `assembleDebug`. Those debug APKs
were signed by the debug key available in the build environment at generation
time, not by a reusable release keystore stored in this repository. If the APK
currently installed on a device came from one of those debug artifacts, a new
release keystore will not update it. Android will require the exact same
previous signing key plus a higher `versionCode`; if that private key cannot be
recovered, the first move to the new release keystore requires uninstalling once
and then future APKs signed with the same release keystore and a higher
`versionCode` can update in place without uninstalling.

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
