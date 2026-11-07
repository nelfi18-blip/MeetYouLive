# Android — Live started mobile push delivery (draft)

Existing behavior retained: approved creators starting a live trigger
LIVE_STARTED over Socket.IO for online followers, sendMulticastPush to at most
500 followers with category live, and create persisted in-app notifications.
Android has a "lives" channel. Notification taps route to /live/{liveId}.
These are not global broadcasts. The follower must allow notifications and
enable the "live" category. A logged-out or blocked user receives none.

Bug fixed: email/password login uses setToken() without necessarily triggering
a NextAuth session change. The global providers effect previously depended on
session and could miss native FCM registration. A no-payload event now triggers
registration after any setToken; foreground rechecks at most once every five
minutes. This does NOT ask permission without user action or change authentication.
Registering a token with backend also checks the HTTP response status, not
just network failures, so 401/429/5xx cannot be silently called success.

Pending proof, not guaranteed by source-code tests:
- Confirm Android Settings -> Notifications permission is granted.
- Confirm MeetYouLive Settings -> Notifications master and live category enabled.
- Confirm the receiving test account follows an approved creator; launch Live
  from a different account/device and inspect Android notification tray while
  follower app is backgrounded/closed, tap and verify same live ID.
- Verify backend FCM_* variables on Render via secret-presence inspection by
  authorized operator (never paste, print or export secrets); verify that
  Firebase project matches google-services.json and tokens are accepted.
- Ensure Android category channel "lives" is not disabled in OS settings.
- Confirm no notification is sent without a follower/opt-in, including no
  spam on other creator events, and no sensitive data in push payload.
- No production test push sent by this PR. Delivery cannot be guaranteed
  until a real device/FCM test is observed.

**NO MERGE/DEPLOY/AAB.** No native or Gradle changes; Android 1.0.57 stays
published. This Draft is based on main but www currently serves PR #1139
directly; do not overwrite that protected Live frontend by merging this
before release sequencing is reconciled.
