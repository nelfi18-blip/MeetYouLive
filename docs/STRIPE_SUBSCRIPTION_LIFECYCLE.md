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
