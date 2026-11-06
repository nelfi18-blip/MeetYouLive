# Agency Live supervision — PR #1138

Continue `feat/agency-live-audience-supervision`; keep Draft. No deployment or merge is part of this change.

## Behavior and security

- Different incident categories or descriptions against the same target can be submitted immediately. Duplicate identity is agency + target type/id + Live + observed role + category + normalized description (Unicode NFKC, whitespace, case), within ten minutes. Reviewed/dismissed reports retain that cooldown; existing reports require no backfill.
- A MongoDB transaction locks one `AgencyReportGuard` counter per agency, checks duplicates and the durable limit of 30 accepted reports per 15 minutes, then inserts the Report atomically. Existing route/IP limits remain. Failed transactions do not record accepted reports. Changing IP or resolving a report does not bypass the durable quota.
- Every supervision request rechecks approved agency status, active/agreed relationship and public/free/current Live. Foreign agencies and suspended/unagreed relationships cannot access the Live/audience/report endpoint. Private, VIP, paid and ended Lives are excluded.
- A 401/403 on any agency supervision request clears streams, audience, selected participant/Live and report draft, aborts pending requests and stops automatic reload until explicit refresh. Auth epochs and per-channel sequences reject stale responses, changed tokens, old pages and unmounted requests. Data already seen by a user cannot be remotely erased from their device.
- Reports retain server-derived agency/Live/creator/observed-role context. Agency accounts cannot list or resolve Admin reports. Central staff permissions remain authoritative. Moderation audit records use the actual staff role.
- Supervision responses use `Cache-Control: no-store`. Audience exposes identifiers/username/role, not email/avatar. Audience is local to the Socket.IO server; this does not introduce distributed presence.
- No automatic video analysis, continuous surveillance, sanctions, stream termination, financial/native/World changes or Agora changes are implemented.

## Verified with synthetic data only

Local Node 24, disposable MongoDB 6 replica set bound to loopback (no persistent volumes), synthetic JWTs/accounts/Lives and no production credentials:

| Check | Result |
| --- | --- |
| Backend general Jest | 1,564 passed; 122 integration tests intentionally skipped without integration URI; separately run in strict integration CI |
| Agency HTTP/Mongo integration | 23 passed, zero skipped |
| Frontend complete Node suite | 732 passed, zero skipped |
| ESLint | Passed with zero warnings |
| Next.js production build | Passed using a clean temporary copy and synthetic API configuration |
| Browser flow | Passed Chromium, 390×844 touch viewport ES/EN/PT and 1280px desktop; screenshots/JSON artifact |

The 23 agency integration cases cover persistence through Admin listing and moderator resolution/audit, exact/normalized duplicates, distinct and concurrent reports, legacy reviewed cooldown/expiry, quota across IP/status, transaction rollback, foreign agencies, pending/suspended/removed/unagreed links, private/VIP/paid/ended Lives, disabled/suspended/unapproved/wrong-role agencies, expired JWT, actual audience/guest target membership and invalid target types.

The 16 state tests cover 401 and 403 on list/audience/report, late successes and late denials, explicit refresh, token change/loss, pagination, disappeared Lives, duplicate/quota draft retention and unmount cleanup.

The browser harness bundles the actual AgencyLiveSupervision and Admin Reports React views with actual HTTP/JWT routes and MongoDB persistence. A separate browser user joins the real Socket.IO Live room. It checks two distinct incident categories for the same viewer, duplicate rejection, central Admin resolution and StaffAuditLog persistence, server-side agency revocation and explicit restoration. Token/language/navigation wrappers are synthetic. No media is transmitted. Screenshots were visually inspected for long-title wrapping, report form, Admin cards, horizontal overflow and 44px agency controls. This is viewport emulation, not a physical phone test.

## Reproduction and GitHub CI

Existing CI keeps its backend/frontend checks. The Mongo integration job now requires exactly 122 passing tests (99 existing + 23 agency), zero skips. It also installs frontend dependencies and temporary pinned esbuild/Playwright tools outside the repository, runs the browser harness against a separate disposable database, and uploads `agency-supervision-browser-evidence` (screenshots and evidence JSON). Tool installation does not change repository dependencies/lockfiles.

Example with an already initialized disposable local replica set:

```sh
cd backend
INTEGRATION_MONGO_URI='mongodb://127.0.0.1:27117/agency_integration?replicaSet=rs0&directConnection=true' npx jest src/controllers/__tests__/agencyLiveSupervision.integration.test.js --runInBand --forceExit
cd ..
npm install --prefix /tmp/agency-browser-tools --no-save esbuild@0.28.2 playwright@1.64.1
/tmp/agency-browser-tools/node_modules/.bin/playwright install --with-deps chromium
INTEGRATION_MONGO_URI='mongodb://127.0.0.1:27117/agency_browser?replicaSet=rs0&directConnection=true' node frontend/scripts/agency-supervision-browser-check.mjs
```

Do not point integration tests at shared databases: they clear fixture collections. CI creates/destroys its own Mongo container. The browser harness deletes only its fixture records. Both reject non-loopback Mongo URIs.

`frontend/vercel.json` disables automatic Git deployments for this branch to honor the no-deployment restriction. No platform environment settings were modified.

## Remaining checks before merge or any future deployment

- Confirm on the target environment that MongoDB supports transactions (replica set), Report collection exists, new AgencyReportGuard collection can be created/written, and the additive `{reporter:1, createdAt:-1}` Report index is provisioned using the normal reviewed migration/index process. No production migration was performed. Without transactions the write fails closed with 503; there is no unsafe nontransactional fallback.
- Owner must test on physical Android/Chrome and iPhone/Safari with isolated approved agency/subcreator/viewer/staff accounts and a genuine public Live: open Agency supervision, select audience, submit two distinct incidents against one participant, reject an exact duplicate, inspect Admin context and centrally resolve. Confirm private/VIP/paid exclusion and suspended/foreign agency denial.
- While the agency view is open, revoke its access from central administration; after the next response, all supervision data/form must disappear. Restore access and require explicit Refresh; repeat during an in-flight request and with an expired session.
- Actual media playback, multi-worker audience completeness, real account sign-in, accessibility with assistive technology and physical-device keyboard/network behavior were not verified by this local synthetic harness. Do not claim them as tested or claim 24/7 monitoring.
- Keep PR Draft until these environment/device checks and the reported GitHub CI are reviewed. This document does not authorize deployment or merge.
