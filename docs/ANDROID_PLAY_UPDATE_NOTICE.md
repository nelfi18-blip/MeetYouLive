# Android Play Store update notice — draft, no release

- The existing AppUpdateBanner handles PWA service-worker updates only.
- This adds a read-only Android App.getInfo().build check of
  /android-release.json from MeetYouLive's www production origin.
- If the installed native versionCode is below latestVersionCode, offer a
  Google Play button, never auto-install, reload or interrupt a Live.
- When it is also below minimumVersionCode, do not offer dismiss. Any Live
  access enforcement remains exclusively the existing #1139 capture guard.
- Current metadata: 1.0.57 / versionCode 57 (already published per owner).
- For every *approved and actually available* Play release, update the
  manifest to its real highest versionCode and evaluate minimumVersionCode.
  Do not bump based only on a generated AAB or an in-review release.
- No native code, permissions, Gradle or new Android AAB required.
- Only Android receives this notice; iOS remains unchanged.
- This PR is based on main while www currently serves #1139 direct deployment.
  DO NOT merge or promote without preserving #1139 Live protection.
