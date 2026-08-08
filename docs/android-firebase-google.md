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

Configure the OAuth clients for web and Android:

- Web Client ID: used by NextAuth on the web frontend.
- `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID`: the same Web Client ID used by the Android native plugin as `webClientId`.
- `GOOGLE_ANDROID_WEB_CLIENT_ID`: backend audience for native Android ID token verification. If omitted, the backend falls back to `GOOGLE_CLIENT_ID`.
- Android Client ID: package `com.meetyoulive.app` plus the registered SHA fingerprints.

The Android Capacitor APK uses native Google Sign-In through `@capgo/capacitor-social-login`. The native flow obtains a Google ID token, sends it to `POST /api/auth/google-native`, and the backend verifies the token before issuing the MeetYouLive backend JWT.

Expected callback path:

- Web/PWA: `/api/auth/callback/google`
- Android APK: `/api/auth/google-native`

## SHA fingerprints

From `frontend/android`:

```bash
./gradlew signingReport
```

Use the `debug` variant for:

- SHA-1 debug
- SHA-256 debug

For release builds that use Firebase push or native Google Sign-In, generate/use the existing release keystore and register its SHA-1/SHA-256 in:

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
