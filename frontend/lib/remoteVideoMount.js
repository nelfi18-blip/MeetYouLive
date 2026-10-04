/**
 * Pure helpers for mounting/playing remote Agora video tracks inside the
 * stable, per-uid DOM containers rendered by MultiVideoGrid.
 *
 * Kept side-effect free (no DOM access, no Agora SDK calls) so the
 * play/clear decision logic can be unit tested without rendering React or
 * mocking the Agora client.
 */

/**
 * Decide which remote participants need their video track (re)played into
 * their mounted DOM container, and which previously-tracked uids should have
 * their bookkeeping cleared (participant left, or stopped publishing video).
 *
 * The caller is responsible for actually invoking `videoTrack.play(container)`
 * for every entry in `toPlay`, and for forgetting the corresponding entries
 * in its own "last played track" bookkeeping for every uid in `toClear`.
 *
 * @param {Array<{uid: string|number, isRemote?: boolean, videoTrack?: any}>} participants
 *   Current participant list (as passed to MultiVideoGrid).
 * @param {Record<string, any>} containers
 *   Map of uid -> mounted DOM container for that participant's remote tile.
 * @param {Record<string, any>} lastPlayedTracks
 *   Map of uid -> the videoTrack reference last played into that uid's container.
 * @returns {{ toPlay: Array<{uid: string|number, videoTrack: any, container: any}>, toClear: string[] }}
 */
export function computeRemoteVideoActions(participants, containers, lastPlayedTracks) {
  const toPlay = [];
  const toClear = [];
  const seenUids = new Set();
  const safeContainers = containers || {};
  const safeLastPlayed = lastPlayedTracks || {};

  (participants || []).forEach((participant) => {
    if (!participant || !participant.isRemote) return;

    const uid = participant.uid;
    const uidKey = String(uid);
    seenUids.add(uidKey);

    const track = participant.videoTrack || null;

    if (!track) {
      // No video track yet, or it was unpublished: forget any previously
      // played track so a future (re)publish is always played again, even
      // if the SDK ever reuses a track reference.
      if (uidKey in safeLastPlayed) {
        toClear.push(uidKey);
      }
      return;
    }

    const container = safeContainers[uid];
    if (!container) {
      // The tile isn't mounted yet (container ref not attached). Nothing to
      // do until the DOM node exists; this same track will be picked up on
      // a later call once the ref callback has fired.
      return;
    }

    if (safeLastPlayed[uidKey] === track) {
      // Already playing this exact track in this container — skip to avoid
      // redundant play() calls / flicker.
      return;
    }

    toPlay.push({ uid, videoTrack: track, container });
  });

  // Forget bookkeeping for any uid that is no longer in the participant list
  // (participant left the channel) and wasn't already queued for clearing.
  Object.keys(safeLastPlayed).forEach((uidKey) => {
    if (!seenUids.has(uidKey) && !toClear.includes(uidKey)) {
      toClear.push(uidKey);
    }
  });

  return { toPlay, toClear };
}
