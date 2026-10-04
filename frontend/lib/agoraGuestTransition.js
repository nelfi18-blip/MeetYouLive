/**
 * agoraGuestTransition.js
 *
 * Deterministic, race-free transition of a Multi-Guest participant between
 * Agora "audience" (subscriber) and "host" (publisher) roles, WITHOUT ever
 * leaving/rejoining the channel.
 *
 * Why this exists: the Agora join effect in `frontend/app/live/[id]/page.jsx`
 * used to list `isGuest` in its dependency array. When a pending guest was
 * approved, React re-ran that whole effect: the cleanup called
 * `agoraClientRef.current.leave()` WITHOUT awaiting it, and the new effect
 * immediately tried to create a second client and `join()` the same channel
 * with the same stable UID (`fnv1aHash(userId)`) as a publisher. This raced
 * an in-flight `leave()` against a new `join()`, so the host frequently never
 * received `user-published` for the guest's tracks even though the backend
 * correctly reported "Invitados 1/3".
 *
 * Fix: once a client has joined (as audience or host), it is promoted/demoted
 * IN PLACE — same client instance, same UID, same channel — by renewing the
 * token with the privileges the server has already authorized and calling
 * `setClientRole()`. No `leave()`/`join()` pair is ever triggered by a guest
 * approval or removal, so the leave/join race described above cannot occur.
 *
 * Server-side authorization is untouched: the publisher token minted by
 * `/api/agora/token?role=publisher` is only issued once the backend confirms
 * the requesting user is the live creator or an approved (`status: "active"`)
 * guest (see backend/src/controllers/agora.controller.js). This module never
 * grants publish capability on its own — it only applies a token/role the
 * server already authorized, so a guest can never self-promote before being
 * approved server-side.
 *
 * Transactional guarantees (promote/demote consistency):
 *
 * `promoteToPublisher()` and `demoteToAudience()` change TWO independent
 * pieces of Agora state in sequence (the client's privilege token, then its
 * `setClientRole()`), plus local track creation/publish. If a step after the
 * privilege change fails, the SDK client can be left in a role that no
 * longer matches what the caller (`page.jsx`'s `isPublisherStateRef`)
 * believes. Both functions therefore:
 *   - never report success unless every step — including publish() for
 *     promote, and setClientRole("audience") for demote — actually
 *     completed;
 *   - attempt a best-effort rollback to the prior role when a later step
 *     fails, so a half-finished transition doesn't leave Agora stuck in an
 *     unintended privilege state;
 *   - on failure, throw an `AgoraGuestTransitionError` carrying the
 *     best-known ACTUAL client role (`currentRole`) and whether rollback
 *     succeeded (`rolledBack`), so the caller can keep its local bookkeeping
 *     honest instead of guessing/assuming "audience" or "publisher";
 *   - always close any local tracks they created/received, even on failure,
 *     so a failed transition never leaks an open camera/mic track.
 */

// Whether this participant is expected to publish camera/mic at all.
export function shouldPublish({ isCreator, isGuest }) {
  return !!(isCreator || isGuest);
}

/**
 * Thrown by promoteToPublisher()/demoteToAudience() when a transition does
 * not fully complete. Carries enough information for the caller to keep its
 * local "am I a publisher?" bookkeeping consistent with Agora's actual
 * client role, instead of assuming the transition's intended end state.
 *
 * - `currentRole`: best-known ACTUAL role of the Agora client after this
 *   function returns — "audience" or "host". Never "unknown": every code
 *   path below can determine which of the two roles the client is actually
 *   left in (rollback either succeeds, taking it back to the role it had
 *   before this call, or it doesn't, leaving it in the role the failed
 *   transition's privilege change already applied).
 * - `rolledBack`: true if a full rollback to the pre-transition role was
 *   confirmed to have completed.
 */
export class AgoraGuestTransitionError extends Error {
  constructor(message, { cause, currentRole, rolledBack } = {}) {
    super(message);
    this.name = "AgoraGuestTransitionError";
    this.cause = cause;
    this.currentRole = currentRole;
    this.rolledBack = rolledBack;
  }
}

/**
 * A minimal FIFO async task queue.
 *
 * Every transition (promote-to-publisher or demote-to-audience) is appended
 * to the same promise chain, so a transition that is still in flight always
 * finishes — success or failure — before the next one starts. This is what
 * guarantees there is never more than one role-changing operation in
 * progress at a time for a given client/uid: if a rejoin-based strategy is
 * ever used instead (e.g. as a fallback), queuing the `leave()` and the
 * subsequent `join()` through the same queue is sufficient to serialize them
 * and avoid the leave/join race entirely.
 */
export function createGuestTransitionQueue() {
  let tail = Promise.resolve();
  return {
    run(task) {
      const result = tail.then(() => task());
      // Never let a rejected transition poison the queue for future
      // transitions — callers still observe the rejection via the promise
      // returned from `run()`.
      tail = result.then(
        () => {},
        () => {}
      );
      return result;
    },
  };
}

/**
 * Best-effort rollback from "host" back to "audience", used when a promote
 * fails after `setClientRole("host")` already succeeded. Returns whether the
 * rollback itself fully completed, and the resulting best-known role.
 */
async function rollbackToAudience({ client, fetchSubscriberToken }) {
  try {
    if (fetchSubscriberToken) {
      const { token: subscriberToken } = await fetchSubscriberToken();
      await client.renewToken(subscriberToken);
    }
    await client.setClientRole("audience");
    return { rolledBack: true, currentRole: "audience" };
  } catch (rollbackErr) {
    // The client's real role is now ambiguous from here (the SDK call may
    // have failed before or after actually applying the role switch), but
    // we must not claim it's "audience" when we can't confirm that. Treat
    // it as still "host" — the privilege set that definitely succeeded
    // earlier in promoteToPublisher() — so the caller never pretends Agora
    // reverted when it didn't, and a future transition can retry the
    // demotion instead of silently diverging from reality.
    return { rolledBack: false, currentRole: "host", rollbackError: rollbackErr };
  }
}

/**
 * Promote an already-joined audience/subscriber client to a publisher,
 * in place: renew to a server-authorized publisher token, switch the
 * client role, create local tracks, and publish — no leave(), no rejoin().
 *
 * Only resolves once publish() has actually succeeded. If any step after
 * the role switch fails, this attempts to roll the client back to
 * "audience" and always throws `AgoraGuestTransitionError` describing the
 * real resulting role — callers must never mark local state as "publisher"
 * when this rejects.
 */
export async function promoteToPublisher({
  client,
  createTracks,
  fetchPublisherToken,
  fetchSubscriberToken,
  onLocalTracks,
}) {
  if (!client) throw new Error("Agora client is not available");

  // Nothing on the client has changed yet — if either of these two steps
  // fails, the client is still "audience" exactly as it was before this
  // call, so there is nothing to roll back.
  const { token: publisherToken } = await fetchPublisherToken();
  await client.renewToken(publisherToken);
  await client.setClientRole("host");

  // From this point on, the Agora client IS in "host" role. Any failure
  // below must be rolled back before the error propagates, otherwise the
  // caller's bookkeeping ("not yet a publisher") would diverge from Agora's
  // actual state ("already host").
  let audioTrack = null;
  let videoTrack = null;
  try {
    [audioTrack, videoTrack] = await createTracks();
    await client.publish([audioTrack, videoTrack]);
  } catch (err) {
    // Defensively attempt to unpublish in case publish() partially applied
    // before throwing (SDK/version dependent) — a no-op if nothing was
    // actually published.
    const createdTracks = [audioTrack, videoTrack].filter(Boolean);
    if (createdTracks.length > 0) {
      await client.unpublish(createdTracks).catch(() => {});
    }
    audioTrack?.close();
    videoTrack?.close();

    const rollback = await rollbackToAudience({ client, fetchSubscriberToken });
    throw new AgoraGuestTransitionError(
      "Failed to promote guest to publisher after acquiring host role",
      { cause: err, currentRole: rollback.currentRole, rolledBack: rollback.rolledBack }
    );
  }

  onLocalTracks?.(audioTrack, videoTrack);
  return { audioTrack, videoTrack };
}

/**
 * Demote a publisher (guest removed by host, or guest left voluntarily)
 * back to plain audience, in place — unpublish + close local tracks, then
 * drop publish privilege via a fresh subscriber token.
 *
 * Local tracks are always closed, even if the token/role switch below
 * fails, so a failed demotion never leaks an open camera/mic. However, this
 * only resolves (reporting success) once `setClientRole("audience")` has
 * actually completed. If the token renewal or role switch fails, it throws
 * `AgoraGuestTransitionError` with `currentRole: "host"` — callers must NOT
 * mark local state as "audience" in that case, since Agora may still
 * consider this client a publisher.
 */
export async function demoteToAudience({ client, audioTrack, videoTrack, fetchSubscriberToken }) {
  if (!client) {
    // No client to act on (already torn down elsewhere) — nothing left to
    // demote, and nothing to roll back either.
    return { currentRole: "audience" };
  }

  const tracks = [audioTrack, videoTrack].filter(Boolean);
  if (tracks.length > 0) {
    await client.unpublish(tracks).catch(() => {});
  }
  // Local resources are closed unconditionally — even if the subsequent
  // role/token transition fails below, we must not leak an open
  // MediaStreamTrack (camera/mic indicator staying on for a track nobody
  // is using or re-publishing).
  audioTrack?.close();
  videoTrack?.close();

  try {
    const { token: subscriberToken } = await fetchSubscriberToken();
    await client.renewToken(subscriberToken);
    await client.setClientRole("audience");
    return { currentRole: "audience" };
  } catch (err) {
    // The client may still be "host" (if setClientRole never ran, or ran
    // and failed) — never report this as a completed demotion. The caller
    // keeps its bookkeeping as "publisher"/"host" so a future transition
    // (e.g. the guest being removed again, or leaving again) can retry
    // instead of silently believing Agora already reverted.
    throw new AgoraGuestTransitionError("Failed to demote guest back to audience", {
      cause: err,
      currentRole: "host",
      rolledBack: false,
    });
  }
}
