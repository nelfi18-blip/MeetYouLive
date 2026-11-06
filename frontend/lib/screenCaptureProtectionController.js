// One owner per visible sensitive surface. Native calls are serialized and read
// the latest desired state, so stale cleanup cannot unlock another surface.
export function createScreenCaptureProtectionController(apply) {
  const owners = new Set();
  let applied = null;
  let queue = Promise.resolve();
  const reconcile = () => {
    queue = queue.then(async () => {
      const desired = owners.size > 0;
      if (applied === desired) return true;
      let success = false;
      try { success = await apply(desired); } catch { /* A bridge failure must not poison later cleanup. */ }
      applied = success ? desired : null;
      return success;
    });
    return queue;
  };
  return {
    reconcile,
    acquire() {
      const owner = Symbol("sensitive-screen");
      owners.add(owner);
      reconcile();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        owners.delete(owner);
        reconcile();
      };
    },
  };
}
