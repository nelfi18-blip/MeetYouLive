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

Production Android Google login is supported through the web/PWA flow on `https://meetyoulive.net`. The installed PWA keeps Google OAuth, the NextAuth callback, session cookies, and local storage in the same Chrome web origin, so it does not need a native browser/deep-link token handoff.

If MeetYouLive needs a Play Store package with the same stable behavior, use a Trusted Web Activity/PWA package that preserves the web origin. Do not route Google login through a Capacitor WebView or a Capacitor `Browser.open()` handoff; that splits the flow between the native WebView and Chrome/Custom Tabs and can leave the user outside the app.

Configure the web OAuth client for NextAuth:

- Web Client ID: used by NextAuth on the web frontend.

Expected callback path:

- Web: `/api/auth/callback/google`

Only add an Android OAuth client if a future native Google Sign-In plugin is introduced. That would be a separate native auth implementation and is intentionally not part of the current PWA/TWA-supported production flow.

## SHA fingerprints

From `frontend/android`:

```bash
./gradlew signingReport
```

Use the `debug` variant for:

- SHA-1 debug
- SHA-256 debug

For a future native build that uses Firebase push or native Google Sign-In, generate/use the release keystore and register its SHA-1 in:

- Firebase Console → Project settings → Android app
- Google Cloud Console → APIs & Services → Credentials → Android OAuth Client, only if native Google Sign-In is enabled

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
