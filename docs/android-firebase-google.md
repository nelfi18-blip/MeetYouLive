# Android Firebase Push and Google Login

This repository is prepared for Android package `com.meetyoulive.app`.

## Firebase configuration

1. In Firebase Console, create/select the MeetYouLive Firebase project.
2. Add an Android app with package name `com.meetyoulive.app`.
3. Register debug SHA-1 and SHA-256 fingerprints before beta testing.
4. Download `google-services.json`.
5. Place it locally at `frontend/android/app/google-services.json`.

Do not commit `google-services.json`. For GitHub Actions, store the base64 value in the repository secret:

- `ANDROID_GOOGLE_SERVICES_JSON_BASE64`

Generate it locally with:

```bash
base64 -w 0 frontend/android/app/google-services.json
```

The Android Debug APK workflow reconstructs the file only during the job and removes it after `assembleDebug`. If the secret is missing, the APK still builds without native Firebase push.

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

Use the `debug` variant for:

- SHA-1 debug
- SHA-256 debug

For a future release build, generate/use the release keystore and register its SHA-1 in:

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
