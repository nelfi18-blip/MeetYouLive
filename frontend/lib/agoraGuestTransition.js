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
 */

// Whether this participant is expected to publish camera/mic at all.
export function shouldPublish({ isCreator, isGuest }) {
  return !!(isCreator || isGuest);
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
 * Promote an already-joined audience/subscriber client to a publisher,
 * in place: renew to a server-authorized publisher token, switch the
 * client role, create local tracks, and publish — no leave(), no rejoin().
 */
export async function promoteToPublisher({ client, createTracks, fetchPublisherToken, onLocalTracks }) {
  if (!client) throw new Error("Agora client is not available");

  const { token: publisherToken } = await fetchPublisherToken();
  await client.renewToken(publisherToken);
  await client.setClientRole("host");

  const [audioTrack, videoTrack] = await createTracks();
  try {
    await client.publish([audioTrack, videoTrack]);
  } catch (err) {
    audioTrack?.close();
    videoTrack?.close();
    throw err;
  }

  onLocalTracks?.(audioTrack, videoTrack);
  return { audioTrack, videoTrack };
}

/**
 * Demote a publisher (guest removed by host, or guest left voluntarily)
 * back to plain audience, in place — unpublish + close local tracks, then
 * drop publish privilege via a fresh subscriber token.
 */
export async function demoteToAudience({ client, audioTrack, videoTrack, fetchSubscriberToken }) {
  if (!client) return;

  const tracks = [audioTrack, videoTrack].filter(Boolean);
  if (tracks.length > 0) {
    await client.unpublish(tracks).catch(() => {});
  }
  audioTrack?.close();
  videoTrack?.close();

  const { token: subscriberToken } = await fetchSubscriberToken();
  await client.renewToken(subscriberToken);
  await client.setClientRole("audience");
}
