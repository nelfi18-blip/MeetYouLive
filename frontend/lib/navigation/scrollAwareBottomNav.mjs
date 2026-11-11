/**
 * Deterministic visibility policy for the floating bottom navigation.
 *
 * Only actual user scroll changes affect visibility. Route changes and an
 * expanded IR menu reset the state in BottomNavEnhanced. Keeping this pure
 * makes mobile scroll thresholds easy to test without a live account.
 */
export function nextBottomNavOnScroll({
  scrollY,
  previousY,
  travel = 0,
  hidden = false,
  totalHeight,
  viewportHeight,
  menuOpen = false,
  reducedMotion = false,
}) {
  const nextY = Math.max(0, Number(scrollY) || 0);
  const prevY = Math.max(0, Number(previousY) || 0);
  const delta = nextY - prevY;
  const result = (nextHidden, nextTravel = 0) => ({
    hidden: nextHidden,
    travel: nextTravel,
    previousY: nextY,
  });

  // Never conceal the nav when the page isn't scrollable, near the top,
  // while the IR menu is open, or with reduced-motion preferences enabled.
  if (
    menuOpen ||
    reducedMotion ||
    !Number.isFinite(totalHeight) ||
    !Number.isFinite(viewportHeight) ||
    totalHeight <= viewportHeight + 140 ||
    nextY <= 72
  ) {
    return result(false);
  }

  // Direct anchor jumps, history restoration, and huge layout shifts
  // should not unexpectedly make the primary navigation disappear.
  if (!Number.isFinite(delta) || Math.abs(delta) >= 190) return result(false);
  if (Math.abs(delta) < 1) return result(hidden, travel);

  const nextTravel =
    travel !== 0 && Math.sign(travel) === Math.sign(delta)
      ? Math.max(-100, Math.min(100, travel + delta))
      : delta;

  // Down: make room for content. Up: return controls sooner. Ignore
  // accidental tiny jitters from Android browser chrome moving.
  if (nextTravel >= 28 && nextY > 150) return result(true);
  if (nextTravel <= -15) return result(false);
  return result(hidden, nextTravel);
}
