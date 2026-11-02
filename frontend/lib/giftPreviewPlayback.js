/**
 * Pure coordination logic for the /dev/gift-animations-preview grid.
 *
 * The grid renders up to 12 heavy SVG/CSS gift animations. Only one may be
 * mounted (playing) at any time: starting a new gift must unmount whatever
 * animation was previously playing before mounting the new one, so two
 * cards never run their animated components simultaneously.
 *
 * This logic is deliberately framework-free (no React) so it can be unit
 * tested directly, independent of any rendering environment.
 */

/** @returns {{ activeId: string|null, token: number }} */
export function createIdlePlaybackState() {
  return { activeId: null, token: 0 };
}

/**
 * Request that `id` start playing. Always wins over whatever was
 * previously active — the caller is expected to stop rendering the
 * previous card's animation component once `activeId` changes, which is
 * what actually unmounts it.
 *
 * `token` is bumped on every request (including replays of the same
 * card) so the caller can use it as a React `key` to force a fresh mount
 * even when replaying the same gift back-to-back.
 */
export function requestPlay(state, id) {
  return { activeId: id, token: state.token + 1 };
}

/** Whether `id` is the single card currently allowed to render its animation. */
export function isCardPlaying(state, id) {
  return state.activeId === id;
}

/**
 * Mark playback of `id` as finished. Only clears `activeId` if `id` is
 * still the active one — a stale completion callback from a card that
 * was already superseded by a newer `requestPlay` must never clear the
 * new active card.
 */
export function completePlay(state, id) {
  if (state.activeId !== id) return state;
  return { activeId: null, token: state.token };
}
