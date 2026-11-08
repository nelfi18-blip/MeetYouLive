# MeetYouLive Android GPS profile — Draft, no production release

Official comparison: Tinder requires foreground device location permission and
uses a distance slider. Optional Passport is a separate location-override product.
Reference: https://www.help.tinder.com/hc/en-us/articles/115005668326-Grant-Access-to-Device-Location

Implementation scope:
- Existing user-initiated navigator.geolocation button is retained in Onboarding/Profile.
- Android declares COARSE/FINE foreground permissions; Android 12+ allows approximate.
- Capacitor WebView's standard geolocation permission callback requests permission.
- MeetYouLiveGeocoderPlugin converts the consented GPS coordinates on the Android
  device into countryCode/country/city/region, never a street address. No external
  geocoding provider, no new subscriptions, no background tracking.
- Existing backend GeoJSON locationPoint continues powering nearby matching.
- Public profile removes exact coordinates; frontend labels only city and country.
- When geocoding is unavailable, retain valid coordinates for nearby and let the
  user enter city/country manually; no made-up city labels.
- Existing manual location, saved profile data, Discover matching, photo validation,
  payments, Agora, World, and all iOS code remain untouched.
- This PR changes the Android manifest and MainActivity: requires an updated
  Google Play AAB after dedicated physical tests, Data Safety/privacy review and
  explicit release authorization. Version 1.0.57 stays unchanged.
- Three Android packaging workflows SKIP this Draft's pull_request events;
  manual workflows remain available only after separate authorization.
- Onboarding does not collect GPS without the user's explicit tap. Existing
  IP/locale country preselection remains a fallback, never represented as GPS.
- CI and static checks cannot prove GPS permission prompt, reverse-geocoding
  accuracy, or nearby matching on a physical phone.
- Do NOT merge into main while the Live protection PR #1139 is deployed directly
  from its own branch: that would risk overwriting the protected frontend.

## GPS privacy pre-merge correction

Both `GET /api/user/:id/public` and `GET /api/user/online` now share a
public-location serializer. The owner/backend still retain precise coordinates
for nearby recommendations; other users receive city/country/region/label only,
including for online cards. Tests cover GPS, no online users, and legacy
text-only locations. This does not mutate saved locations or reveal a street
address and remains a Draft until device and release validation.

## Searching in another country from the existing Profile

- "Use current location" remains an explicit user-triggered GPS refresh and sets Discover to nearby.
- The new Profile country selector saves `discoveryPreferences.searchCountry`, independent of physical `location`, `locationPoint` and public profile.
- Selecting a different country scopes Discover to that entire country; no requirement to match the current home city.
- Clearing country destination restores existing country/city filtering if that scope is selected.
- When Nearby is selected, Discover uses the saved actual GPS instead of the remote country.
- Manual changes of the member’s physical country/city/region clear stale GPS coordinates.
- No automatic background tracking, new Android permissions or native package from this adjustment.
- Confirm live device behavior and permission/data-safety review before merge/release.

## Refresh actual GPS when opening Discover
- The Explore → Discover tab detects whether the user selected the **Nearby** scope in Profile.
- When the browser reports geolocation permission as already granted, Discover requests a fresh foreground GPS fix (`maximumAge: 0`) and PATCHes only the authenticated user's location **before** loading nearby candidates.
- A visible "Update current location" button handles explicit permission requests and manual refreshing. Country/global scopes never trigger GPS.
- No background polling or location query-string parameters. Failure is disclosed, and discovery can still use the last saved location; no false claims of current position.
- Native Android reverse geocoding resolves place names when available; failure does not copy an old city or country onto new GPS coordinates.
- No APK/AAB built, no Google Play deployment, and no merge before physical testing.

## 7-Nov: Physical permission tests and Settings destination

Physical offline Android diagnostic:
- Precise: PASS screenshot, city Nantucket / Massachusetts / US, estimated 13 m accuracy.
- Approximate: PASS as reported by the owner, still resolves the city.
- Denied: PASS screenshot, permission code 1 with no data sent, app remains open.
- These tests validate only the isolated GPS plugin; NOT the complete production app.

In the SAME PR, a mobile-first `/settings/location` page is linked from Settings → Discovery. Nearby uses consented physical GPS and a max-distance control; Country uses a separately saved country/city/optional region; Global searches worldwide. Switching destinations must not overwrite physical coordinates. Preferences save with `PATCH /api/user/me` while retaining pre-existing age/language/goals. Profile editing keeps the city/region fields and clears stale destination values when changing countries. Live is unchanged and worldwide. ES/EN/PT strings and targeted tests were added.

Remaining before merge: inspect latest CI / Vercel, integration/UX testing on a preview with real backend accounts and persistence after reopening, privacy / Google Play Data Safety review, and explicit distribution authorization. Do not publish Android or merge while any of these gates remain unverified.
