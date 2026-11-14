# MeetYouLive Android — DEX optimization / R8 safe trial (11 Nov 2026)

**Draft only. No merge, no signed APK/AAB generation, no Google Play change, no impact on the installed app.**

## Evidence and reason

- Owner's Google Play Console screenshot of active **1.0.57** (versionCode **57**) indicates: **14.4 MB uncompressed DEX**, **obfuscation 1%**, optimization/shrinking percentages not provided, R8 config absent, Play warning **DEX optimization low**.
- 16 KB page-size compatibility is **supported** in the same console inspection.
- Repo baseline: AGP **8.10.1**, `frontend/android/app/build.gradle` Release had `minifyEnabled false`; default non-optimized ProGuard file, no active custom keep rules.
- Google Play's technical-quality requirements are planned from **February 2027**: apps above 10 MB of DEX must attain **25% each** in shrinking, optimization and obfuscation. An advisory warning for the existing release is not itself proof that 1.0.57 has been rejected.
- Official documentation:
  - https://support.google.com/googleplay/android-developer/answer/17492799
  - https://developer.android.com/google/play/vitals/code-optimization
  - https://developer.android.com/topic/performance/app-optimization/enable-app-optimization
  - https://developer.android.com/topic/performance/app-optimization/adopt-optimizations-incrementally

## Current change — preparation only

- Add `-PmeetyouliveR8Trial=true` as an **explicit opt-in** for an experimental optimized release build. Without this flag, behavior remains **identical** to the known-good release (R8 disabled, original default rules).
- In trial only: `minifyEnabled true`, `shrinkResources true`, and default `proguard-android-optimize.txt`, using existing **AGP 8.10.1**; no speculative AGP 9 upgrade.
- Disable **all automatic** signed Release AAB, Release APK and Debug APK workflows for this draft branch. Manual workflow runs are not authorized by this PR.
- Add static regression coverage to the existing frontend test suite for the gating, workflow skip conditions, app ID, signing and native dependencies.
- Do **not** change the Google OAuth IDs, FCM, billing, Stripe, Live, screen protection, GPS, World or UI behavior. Production source code should not execute a changed release configuration accidentally.

## Future proof required BEFORE approval to change release settings

1. Explicit approval to build a **separate, non-published** test artifact from this specific branch using the trial property. Inspect artifact manifest, identical expected signing/app ID if update compatibility is being tested, or use a separate test application ID for an independently installed device-only build. Never overwrite current installation without authorization.
2. Verify optimized Gradle build succeeds with a reproducible lockfile, Java 21, existing compatible plugins and **no broad keep rules that hide the optimization problem**. If dynamic/reflective Capacitor plug-in registration fails, add the narrowest justified keep rules backed by tests.
3. Measure output with `android analyze` or `r8.json` extracted from an AAB **only when an artifact is explicitly approved**; separately record DEX size and all three Google metrics. Never claim 25% from a source-code toggle.
4. Physical Android acceptance (prefer a dedicated device): install/update, Google and email login, login persistence, Coins and Google Play Billing purchase/restore, FCM foreground/background push and live/call notifications, Agora Live and mini player, protected screenshots/recents, calls, GPS permissions and Discover, file/photo upload, camera, selfie's native bridge, logout/relogin and crashes/logcat.
5. Compare crash rates, ANRs and startup behavior to 1.0.57 before any release, and confirm Test Track / publishing plan and fresh versionCode. Keep 1.0.57 as rollback baseline.
6. Review and approve the final optimized build and potential merge **separately**. Any change to the signing key, versionCode or Play publishing needs a separate explicit authorization.

## What's deliberately NOT done

- No optimized binary built; no measurements claimed.
- No test device or production install modified.
- No automatic release workflow triggered for this PR.
- No merge, production deployment, Play Console changes, package ID change or signing-credential access.
- No shortcut of relying on green JS/CI tests as proof native bridges work under R8.
