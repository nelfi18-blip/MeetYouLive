# Stripe subscription lifecycle safety

This change coordinates subscription Checkout, subscription webhooks, explicit
cancellation and account deletion (including the administrative hard-delete
entry point). The legacy admin cleanup filters/behavior are not repaired or
changed by this Stripe fence. It does not change prices, Coins, payouts,
Apple/Google billing or financial-deletion filters. Tests use simulated Stripe
and a disposable MongoDB replica set; no real cancellation is authorized by tests.

## Deployment gate

`STRIPE_SUBSCRIPTION_FENCE_READY` defaults off. While off, protected operations
fail closed before biometric scheduling. Do not enable it during a mixed-version
rollout: first deploy this version to **all** API workers, stop/drain the old
workers and their in-flight requests, and verify no other application creates
subscriptions for these customers outside this protocol. Only then may an
authorized operator set it to `true`. This PR does not change live configuration.

New validated User creations after that gate is enabled receive the immutable,
non-public `stripeSubscriptionTrackingVersion=1`. Existing accounts, imports and
untracked upserts are not silently backfilled: missing provenance requires manual
review even if Subscription is absent or locally marked canceled. No customer
is linked by email. A conservative block is intentional, not evidence of debt.

## Durable coordination

`StripeSubscriptionLifecycle` is an operational per-user fence, not an accounting
ledger. It records an owner, operation, minimal provider IDs, mutation idempotency
key and pending/confirmed/unknown outcome. Customer identity is persisted before
local Subscription updates, so a local save failure cannot cause a second customer
to be created on retry. Both Checkout endpoints share the same fence and reject
another open subscription Checkout rather than silently creating another one.

The fence has no TTL or time-based takeover. A lost process/Stripe response may
still complete; time alone cannot establish cancellation or absence of a Checkout.
Such operations remain blocked with bounded HTTP errors and durable evidence for
manual review. No background job replays mutations or cancels subscriptions.

Before biometric scheduling, deletion checks all known customers, the referenced
subscription, all subscription pages, open subscription Checkouts and future
subscription schedules. Only canceled/incomplete-expired subscriptions are terminal;
active/trialing/past-due/unpaid/paused/incomplete or unknown states block deletion.
Scheduled cancellation is not terminal cancellation. Errors, malformed responses,
invalid IDs, incomplete pagination or ownership mismatches fail closed.

Settings preserves the session on a rejection and links to the subscription
resolution screen. That screen offers the existing cancellation action even
when local status is stale/canceled; it still asks for explicit confirmation. Only that
authenticated cancellation endpoint may call Stripe cancellation; the guard never
does. Cancellation is read back from Stripe, and deletion performs its own fresh
verification. Multiple/unlinked subscriptions are a manual-review case, not consent
to cancel all subscriptions. Pending invoices/refunds/debts are not resolved here.

No Stripe call runs inside the account-deletion MongoDB transaction. The minimal
deleted fence commits in the same session as User/Subscription deletion. Confirmed
customer/mutation details are removed from that tombstone. Late webhooks cannot
upsert Subscription for a missing/deleted user. A MongoDB abort preserves the local
records and rolls back the tombstone; the independent durable biometric retry
mechanism from #1129 is unchanged.

## Manual review (not an automatic recovery permission)

The review queue is the restricted `StripeSubscriptionLifecycle` collection:
`review.required=true`, a pending/unknown mutation, or an interrupted working fence.
There is deliberately no public API or automatic unlock for this queue.

An authorized operator must:

1. Identify the exact user ID, owner token, mutation key/type and timestamps.
   Confirm the original worker/request is stopped before considering recovery.
2. Resolve the operation from authoritative Stripe IDs/request history, not email
   matches. Reconstruct **all** customer links; a single locally canceled record
   does not prove historical coverage. If completeness cannot be established,
   leave the account blocked. Never blindly replay an old idempotency key.
3. Verify current subscriptions, open Checkouts and schedules. Obtain separate,
   explicit authorization for any cancellation or other external mutation; this
   runbook does not grant it. No automatic expirations, refunds or write-offs.
4. Record reviewer identity/time and evidence. Only after resolving every unknown
   outcome may a controlled compare-and-set against the reviewed owner/key record
   correct the customer ID set, mark review cleared and release the fence. No bulk
   backfill, timeout-based unlock, or guessed ownership is safe.
5. Have the user retry; deletion re-queries Stripe and does not trust the manual
   review alone as proof of terminal subscription state.

No production review, migration, account modification or provider mutation was
performed by this PR. The operational records do not establish a fiscal retention
policy; the existing financial-policy review remains separate.

## Activation and continuity (PR #1131 follow-up)

The off gate also blocks explicit cancellation and subscription webhooks. It is
NOT a production steady state. There is no safe promise of uninterrupted
cancellation during an initial mixed-version rollout: old writers do not honor
the fence. Preserve unrelated service traffic and deletion **intake**, and use a
short announced window for protected subscription execution. No change here
enables the flag, merges or deploys. The exact PR branch disables Vercel Git
deployments in frontend/vercel.json so GitHub CI can run without requesting a new
preview; other branches retain their existing behavior.

Before activation, assign a release owner, two review operators and a support
escalation owner. Provision the Lifecycle and StripeSubscriptionReview collections,
majority writes and replica-set transactions. Rehearse with synthetic data:

1. Stage all new workers with the gate off. Verify unrelated routes and health;
   do not route subscription mutations to a gated canary alongside old writers.
2. Quiesce protected execution on the OLD pool at ingress: subscription Checkout,
   explicit cancellation, deletion execution and subscription webhook consumers.
   Drain and stop every old API worker, in-flight request, background consumer and
   external subscription creator. Record exact process/request IDs, drain evidence
   and deployment SHA. Time alone cannot prove an uncertain request had no effect.
   Keep Coins and Connect processing unchanged.
3. Route deletion intake/status to the new off pool. Preserve its receipts. Let
   Stripe retry subscription webhooks with non-2xx responses during this brief
   window; record the last delivery ID/time. Target under 15 minutes; if the
   release budget is exceeded, page the release owner immediately. Do not
   acknowledge unprocessed events or use a multi-day retry period as a queue.
4. Verify every reachable subscription writer runs this protocol and no external
   creator bypasses it. Enable the gate on the isolated new pool, verify readiness,
   then atomically switch protected traffic to it. Keep the old pool stopped.
   Accounts created while off still require historical review; never backfill them.
5. Verify synthetic tracked deletion; historical rejection with a receipt; active
   subscription blocking deletion; explicitly confirmed cancellation then deletion;
   and delayed webhook rejection after deletion. Verify webhook retries catch up,
   unknown-operation counts and queue age. A true flag alone proves none of this.

Forward recovery: keep this protocol and tombstones. Off pauses protected
execution while preserving intake; page the owner and resolve within the release
budget. Never roll back to an unfenced binary, clear locks, bulk-certify history
or replay unknown mutations. Strictly uninterrupted protected execution during
the first transition is an operational blocker if a brief window is unacceptable.

## Durable deletion requests and human response deadlines

After authentication and the existing staff restrictions, DELETE /api/user/me
records a deletion request **before** checking the deployment gate. Both this
entry point and administrative hard deletion use the same intake. Rejections
retain HTTP 409/503 and include `deletionRequest`: ID, original request time,
24-hour review deadline and 72-hour escalation deadline. The message includes
the receipt/deadline. It is a receipt for review, not a false deletion success.
GET /api/user/me/deletion-request returns only the authenticated user's receipt
after a browser/session restart. No provider access is needed. MongoDB failure
cannot produce a confirmed receipt; alert and use the existing support channel.

Retries never extend deadlines. Successful deletion closes the receipt with the
tombstone; self-service completion is in the existing deletion transaction.
Rollback leaves the request pending. Recovery alone does not close a request.
No automatic cancellation, account deletion or time-based fence release is added.

Run the restricted read-only queue command at least every 15 minutes in the
operator's monitoring system, and throughout rollout:

```sh
node backend/scripts/stripe-subscription-review.js queue
```

It includes ALL pending deletion requests (even idle/provider failures), historical
reviews, interrupted workers and pending/unknown operations. Priority becomes
`overdue` at 24 hours and `escalated` at 72 hours; either yields exit 2 for monitoring.
Exit 1 means monitoring failed, not an empty queue. It never resets deadlines,
resolves cases, releases locks or modifies Stripe. Its IDs/keys are restricted
operational data; do not publish its output.

Assign each receipt to a named owner before 24 hours; provide the user its reason,
receipt and next review date. At 72 hours page the escalation owner and retain the
original overdue record until actual completion. After recovery, follow up with
the user to retry the existing deletion endpoint and verify completion. Do not
depend on users to discover their fence was released.

**Remaining release blocker:** this PR supplies persistence, status, deadlines
and a failing monitor, but does not configure a real scheduler/pager or staff a
support process. These must be assigned and rehearsed before activation. If
Stripe history remains unknowable, obtain authoritative records or escalate to
provider/support. Software cannot guarantee finite deletion completion while
also refusing unverifiable deletion. Escalation guarantees visibility, not
permission to bypass verification; never silently abandon the request.

## Verifiable single-account historical review

The restricted CLI extends the manual procedure above, without a public recovery
API. It does not load .env files. Credentials must be explicitly selected by an
authorized operator; no production invocation or credential provisioning occurs
in this PR. Use read-only Stripe credentials and a MongoDB role that can read
User/Subscription and write only the two operational collections. Create those
collections before transactions. Never place credentials in evidence files.

```sh
node backend/scripts/stripe-subscription-review.js prepare USER_ID
node backend/scripts/stripe-subscription-review.js check reviewed-evidence.json
node backend/scripts/stripe-subscription-review.js apply reviewed-evidence.json --apply-reviewed-evidence
```

1. Prepare exports the exact Lifecycle + Subscription snapshot hash and minimal
   provider IDs. A blocked deletion creates the historical fence if absent.
2. Two authorized reviewers reconstruct history from creation through the drained
   writer boundary using immutable application audit IDs, provider request logs
   and authoritative exports. Include ALL customers, duplicates and unused ones.
   No email matching, bulk backfill, absence inferred from search, missing local
   Subscription or locally canceled status establishes coverage. Deleted provider
   customers, lost audit history or conflicting ownership require investigation.
3. Store a restricted immutable evidence artifact containing the prepared snapshot,
   provider account/environment, covered time interval, exact inventory, drain
   evidence, reviewers and request outcomes. Hash it. The separate evidence JSON
   contains userId, snapshotSha256, evidenceSha256, ticket locator, two distinct
   reviewer IDs, historyComplete=true, writersDrained=true, 40-hex deploymentSha,
   inspectedAt (UTC, under 15 minutes old) and customerIds. This is explicit human
   attestation: the CLI cannot authenticate reviewer identities or verify an
   external artifact's truth. Restrict execution and require both approvals.
4. `check` performs only reads: all customers, all subscription pages, open
   Checkouts, schedules and the locally referenced subscription. No metadata or
   entitlements are modified. Active objects may remain; ownership is not consent
   to cancel. Incomplete pagination or conflicting metadata fails closed.
5. Explicit `apply` repeats verification and transactionally appends an audit plus
   releases ONLY the reviewed fence. The full local snapshot must still match;
   concurrent changes or an audit failure abort. Prepare/review again after any
   mismatch. Provider calls never run inside the MongoDB transaction.

Historical customers missing userId metadata can pass only with the two-reviewer
provider-ID evidence. The exact legacy customer IDs and audit reference are
persisted; later reads still require exact IDs, live responses and no conflicting
metadata. No Stripe metadata is edited to manufacture ownership. The application
only inserts review audits; approved operational access/retention is a prerequisite.
The audit survives deletion and stores no emails, billing payloads or credentials.

## Unknown operation recovery matrix

First stop the exact stored owner and establish the drained-writer boundary.
Evidence for a working fence must contain `stoppedOwner` matching it. For every
pending/unknown mutation, include the exact `mutationKey`, `requestLogReference`
and an authoritative `outcome`. The CLI has no provider request-log API; obtain
those records separately. Missing records remain a provider/support escalation.

| Kind | Confirmed evidence / readback | After recovery |
| --- | --- | --- |
| customer.create | Exact resulting customer externalId in the complete inventory, verified by retrieval | Reuse that ID, never create a replacement to resolve uncertainty |
| checkout.create | Exact externalId; subscription mode, customer and user metadata verified by retrieval | Open Checkout still blocks deletion and a duplicate Checkout |
| subscription.cancel | Exact locally referenced externalId; matching customer and canceled status by retrieval | Fresh deletion checks; no cancellation replay |
| Any pending/unknown | outcome=no_effect only with authoritative request-log evidence and two reviewers | Record no_effect, release without executing any mutation |

For a confirmed outcome include `externalId`; for no_effect omit it. For ordinary
historical review omit mutationKey/outcome/externalId. A still-active subscription
is not confirmed canceled. Object absence, empty lists, elapsed idempotency retention
or network errors do not prove no_effect. No old idempotency key is replayed.
Separate explicit consent is still required for any later cancellation; multiple
unlinked subscriptions need individual identification, never cancel-all.

Keep check/apply output in the restricted case, notify the user of the next step
and confirm the original receipt becomes completed after verified deletion.

## GitHub verification and remaining operational prerequisites

The dedicated disposable MongoDB 6 replica-set job now requires **99** passing
integration tests, zero skipped: the original 77 plus 22 activation/recovery tests.
Stripe is fully mocked. The new cases cover off/on behavior, accounts created off,
stable receipts/deadlines, escalation, historical review, read-only check, exact
unknown outcomes, audit rollback, stale snapshots, provider failures, ownership,
pagination and no automatic cancellations or mutation replays. General backend,
frontend tests, lint and build remain required. A general job skipping MongoDB
tests is insufficient; the strict dedicated count must pass.

Before real activation: proven writer drain, authoritative historical/unknown
evidence, restricted operator roles/evidence retention, staffed monitoring and
escalation, webhook catch-up and a rehearsed traffic switch/forward recovery.
CI cannot establish these production facts. No production flag, user, scheduler,
credential, deployment or merge is changed by this PR follow-up.
