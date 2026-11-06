import test from "node:test";
import assert from "node:assert/strict";
import { createAgencySupervisionStore } from "../lib/agencySupervisionStore.js";
const LIVE = "507f1f77bcf86cd799439011";
const ok = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const pending = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
function fixture() {
  const requests = []; let token = "agency-token-a";
  const store = createAgencySupervisionStore({ getToken: () => token, fetcher: (_url, options) => {
    const task = pending(); requests.push({ ...task, options, url: _url }); return task.promise;
  } });
  return { store, requests, token(value) { token = value; } };
}
async function populated(f) {
  const load = f.store.loadLives(); f.requests.at(-1).resolve(ok({ lives: [{ id: LIVE, title: "Sensitive stream" }] })); await load;
  const audience = f.store.chooseLive(LIVE); f.requests.at(-1).resolve(ok({ viewers: [{ userId: "viewer", username: "Sensitive name" }], totalLocal: 1 })); await audience;
  f.store.setTarget({ targetType: "viewer", targetId: "viewer" }); f.store.setReason("Observed a specific incident");
}
function expectCleared(store) {
  const state = store.getSnapshot(); assert.deepEqual(state.lives, []); assert.deepEqual(state.audience, []);
  assert.equal(state.selectedId, ""); assert.equal(state.localCount, 0); assert.equal(state.reason, "");
  assert.deepEqual(state.target, { targetType: "live", targetId: "" }); assert.equal(state.sending, false);
}
for (const status of [401, 403]) for (const channel of ["lives", "audience", "report"]) {
  test(`${status} from ${channel} clears all sensitive state and blocks automatic polling`, async () => {
    const f = fixture(); await populated(f);
    const task = channel === "lives" ? f.store.loadLives() : channel === "audience" ? f.store.loadAudience() : f.store.submitReport();
    f.requests.at(-1).resolve(ok({}, status)); await task; expectCleared(f.store);
    const count = f.requests.length; await f.store.loadLives(); await f.store.loadAudience();
    assert.equal(f.requests.length, count); assert.equal(f.store.getSnapshot().error, "accessRevoked");
  });
}
test("a delayed successful list cannot restore a revoked audience/selection", async () => {
  const f = fixture(); await populated(f); const old = f.store.loadLives(), request = f.requests.at(-1);
  const denied = f.store.loadAudience(); f.requests.at(-1).resolve(ok({}, 403)); await denied;
  request.resolve(ok({ lives: [{ id: LIVE, title: "Stale secret" }] })); await old; expectCleared(f.store);
});
test("a delayed audience or report success cannot restore revoked data or notices", async () => {
  const f = fixture(); await populated(f); const audience = f.store.loadAudience(), a = f.requests.at(-1);
  const report = f.store.submitReport(), r = f.requests.at(-1);
  const denied = f.store.loadLives(); f.requests.at(-1).resolve(ok({}, 401)); await denied;
  a.resolve(ok({ viewers: [{ userId: "secret" }], totalLocal: 1 })); r.resolve(ok({ reportId: "old" }, 201));
  await Promise.all([audience, report]); expectCleared(f.store); assert.equal(f.store.getSnapshot().notice, "");
});
test("a forbidden older list response revokes the same auth epoch even after a newer success", async () => {
  const f = fixture(); await populated(f); const old = f.store.loadLives(), request = f.requests.at(-1);
  const latest = f.store.loadLives(); f.requests.at(-1).resolve(ok({ lives: [{ id: LIVE }] })); await latest;
  request.resolve(ok({}, 403)); await old; expectCleared(f.store);
});
test("explicit refresh establishes a new epoch and rejects the previous epoch's responses", async () => {
  const f = fixture(); await populated(f); const old = f.store.loadAudience(), request = f.requests.at(-1);
  const refresh = f.store.refresh(); f.requests.at(-1).resolve(ok({ lives: [{ id: LIVE }] })); await refresh;
  request.resolve(ok({}, 403)); await old;
  assert.equal(f.store.getSnapshot().lives.length, 1); assert.equal(f.store.getSnapshot().error, "");
});
test("account/token changes clear data and a former account cannot restore it", async () => {
  const f = fixture(); await populated(f); const old = f.store.loadAudience(), request = f.requests.at(-1);
  f.token("different-agency"); request.resolve(ok({ viewers: [{ userId: "old-person" }], totalLocal: 1 })); await old; expectCleared(f.store);
  const refresh = f.store.refresh(); f.requests.at(-1).resolve(ok({ lives: [] })); await refresh;
  assert.equal(f.requests.at(-1).options.headers.Authorization, "Bearer different-agency");
});
test("a missing token revokes rather than leaving an earlier view on screen", async () => {
  const f = fixture(); await populated(f); f.token(null); await f.store.loadLives(); expectCleared(f.store);
});
test("latest audience page wins and choosing a different live ignores old results", async () => {
  const f = fixture(); await populated(f); const old = f.store.loadAudience(), request = f.requests.at(-1);
  const page = f.store.setPage(2); f.requests.at(-1).resolve(ok({ viewers: [{ userId: "page-two" }], totalLocal: 41 })); await page;
  request.resolve(ok({ viewers: [{ userId: "page-one" }], totalLocal: 41 })); await old;
  assert.equal(f.store.getSnapshot().audience[0].userId, "page-two");
});
test("removed/private live clears selection immediately and cannot reappear from old audience", async () => {
  const f = fixture(); await populated(f); const old = f.store.loadAudience(), request = f.requests.at(-1);
  const lives = f.store.loadLives(); f.requests.at(-1).resolve(ok({ lives: [] })); await lives;
  request.resolve(ok({ viewers: [{ userId: "old-person" }], totalLocal: 1 })); await old; expectCleared(f.store);
});
test("duplicate and spam errors preserve the draft and use distinct translated errors", async () => {
  const f = fixture(); await populated(f);
  for (const [status, key] of [[409, "duplicate"], [429, "rateLimited"]]) {
    const task = f.store.submitReport(); f.requests.at(-1).resolve(ok({}, status)); await task;
    assert.equal(f.store.getSnapshot().error, key); assert.ok(f.store.getSnapshot().reason); assert.equal(f.store.getSnapshot().sending, false);
  }
});
test("component unmount aborts requests and prevents late notification or state mutation", async () => {
  const f = fixture(); const stop = f.store.start(); const request = f.requests.at(-1); stop();
  assert.equal(request.options.signal.aborted, true);
  const before = f.store.getSnapshot(); request.resolve(ok({ lives: [{ id: LIVE }] }));
  await new Promise((resolve) => setTimeout(resolve, 0)); assert.equal(f.store.getSnapshot(), before);
});
