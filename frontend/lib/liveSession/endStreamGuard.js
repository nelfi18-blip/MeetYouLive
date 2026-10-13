/**
 * endStreamGuard — serializes "end stream" attempts so a double tap on
 * the mini-player's confirm button (or any other concurrent caller)
 * never fires two overlapping PATCH /api/lives/:id/end requests. Pure/
 * framework-free so it can be unit tested directly.
 *
 * Deliberately does NOT decide what counts as success — `performEndStream`
 * must resolve on confirmed success and reject (throw) on any failure
 * (HTTP-level or network-level); the caller (LiveSessionContext) decides
 * what to do in each case (only release Agora resources on success, keep
 * the session alive and surface a retryable error on failure).
 */
export function createEndStreamGuard() {
  let pending = null;

  function isPending() {
    return !!pending;
  }

  /**
   * Runs `performEndStream` unless a previous call is still in flight, in
   * which case the SAME in-flight promise is returned instead of starting
   * a second request — every caller observes the same eventual
   * success/failure.
   */
  function run(performEndStream) {
    if (pending) return pending;
    pending = Promise.resolve()
      .then(() => performEndStream())
      .finally(() => {
        pending = null;
      });
    return pending;
  }

  return { run, isPending };
}
