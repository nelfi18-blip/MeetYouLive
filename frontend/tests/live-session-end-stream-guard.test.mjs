import test from "node:test";
import assert from "node:assert/strict";
import { createEndStreamGuard } from "../lib/liveSession/endStreamGuard.js";

test("run: resolves when performEndStream resolves (HTTP 200 case)", async () => {
  const guard = createEndStreamGuard();
  const result = await guard.run(async () => "ok");
  assert.equal(result, "ok");
  assert.equal(guard.isPending(), false);
});

test("run: propagates an HTTP-level failure (e.g. response.ok === false) as a rejection, never swallowed", async () => {
  const guard = createEndStreamGuard();
  await assert.rejects(
    guard.run(async () => {
      throw new Error("END_STREAM_HTTP_500");
    }),
    /END_STREAM_HTTP_500/
  );
  assert.equal(guard.isPending(), false, "guard must release the lock after a failure, so the host can retry");
});

test("run: propagates a network-level failure (fetch() itself rejecting) as a rejection", async () => {
  const guard = createEndStreamGuard();
  const networkError = new TypeError("Failed to fetch");
  await assert.rejects(guard.run(async () => {
    throw networkError;
  }), networkError);
  assert.equal(guard.isPending(), false);
});

test("run: a double-click while a request is in flight reuses the SAME in-flight call, never fires a second request", async () => {
  const guard = createEndStreamGuard();
  let callCount = 0;
  let resolveFirst;
  const first = guard.run(
    () =>
      new Promise((resolve) => {
        callCount += 1;
        resolveFirst = resolve;
      })
  );

  // Let the guard's internal microtask actually invoke performEndStream()
  // (and thus assign resolveFirst) before asserting/continuing.
  await Promise.resolve();
  assert.equal(guard.isPending(), true);
  // Second "click" while the first PATCH is still in flight.
  const second = guard.run(() => {
    callCount += 1;
    return Promise.resolve("should never run");
  });

  resolveFirst("done");
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(callCount, 1, "the underlying end-stream call must only ever run once per in-flight request");
  assert.equal(firstResult, "done");
  assert.equal(secondResult, "done", "every caller must observe the same eventual outcome as the in-flight call");
});

test("run: after a failure resolves, a subsequent retry call is allowed to run again (not permanently locked)", async () => {
  const guard = createEndStreamGuard();
  let attempt = 0;

  await assert.rejects(
    guard.run(async () => {
      attempt += 1;
      throw new Error("network error");
    })
  );
  assert.equal(guard.isPending(), false);

  const result = await guard.run(async () => {
    attempt += 1;
    return "ok";
  });

  assert.equal(attempt, 2, "retry after a failure must actually call the backend again, not be silently skipped");
  assert.equal(result, "ok");
});

test("isPending: reflects in-flight state correctly across the request lifecycle", async () => {
  const guard = createEndStreamGuard();
  assert.equal(guard.isPending(), false);

  let resolveCall;
  const pending = guard.run(() => new Promise((resolve) => { resolveCall = resolve; }));
  await Promise.resolve();
  assert.equal(guard.isPending(), true);

  resolveCall();
  await pending;
  assert.equal(guard.isPending(), false);
});
