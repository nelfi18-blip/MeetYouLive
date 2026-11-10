# MeetYouLive — location rollout and verified rollback point (7 Nov 2026)

## Immutable pre-release reference

- Git commit used by production frontend AND Render backend before PR #1141:
  `c61628ddf5f2f64e3278157ab851d7d79f44c0e2`.
- Git branch created from that exact commit: `checkpoint/pre-location-2026-11-07`.
- Vercel production deployment `dpl_Chi2ugSDcifNbP3M6BTfY63ePu3p` (READY at inspection).
- Render production backend service `srv-d6sb5ep5pdvs73fis8fg`, last live deploy at inspection `dep-dbnqv2ss728c739i29e0`, same commit.
- Existing Android production installation and Play app stay untouched in this phase.
- This is a **code/deployment checkpoint**, not a database backup. Any DB backup requires a separate explicit verification.
- The project includes real-time streaming, login and payment operations; never blindly force-reset `main`, disable live workers or overwrite secrets.

## Safe rollout gates (all required)

1. Full latest-head CI: backend, disposable MongoDB integration and frontend tests/build **SUCCESS**. No pending checks.
2. Vercel preview READY for the exact tested commit. Review `/settings/location` UI on narrow Android widths, auth fallback and ES/EN/PT.
3. Confirm the backend changes can be safely released before or with the frontend; remote country/city search is persisted on the backend. A frontend-only production change cannot validate full behavior.
4. Privately verify production's handling of `PATCH /api/user/me`, profile preferences persistence, live/calls, and public GPS serialization without collecting real member coordinates in logs.
5. Review Google Play Data Safety and Privacy Policy for foreground precise/approximate GPS permissions. Native changes require Android build/update and release checks; no automatic AAB/Play publish.
6. Confirm live stream/worldwide access and critical account login/photo verification stay functional.
7. Confirm rollback controls (Vercel rollback to known-good deployment; Render deploy history/revert to the known-good commit; do not roll back databases blindly).
8. Explicit approval for a merged production rollout and any native Play publication; do not equate a preview success with production acceptance.

## If a production regression occurs

- Stop the rollout and record the exact current commit and affected request path.
- Use Vercel's supported rollback to restore `dpl_Chi2ugSDcifNbP3M6BTfY63ePu3p` for the frontend after checking current production.
- For backend, deploy the last known good commit `c61628dd...` using the Render project's approved deployment procedure; verify `/api/health` and user-facing flows. Render uses auto-deploy from `main`, so coordinate branch/commit selection to prevent an immediate unwanted redeploy.
- Preserve existing MongoDB documents. `searchCity` and `searchRegion` are additive preference fields, not a destructive schema migration.
- Do not delete live user data or reset payments.
