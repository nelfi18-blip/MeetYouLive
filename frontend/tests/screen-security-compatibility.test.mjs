import test from "node:test";
import assert from "node:assert/strict";
import { applyVerifiedScreenSecurity as apply } from "../lib/screenSecurityContract.js";

for (const [name, response] of [
  ["old plugin empty ACK", undefined], ["absent payload", null],
  ["unversioned bit", { secure: true }],
  ["unknown contract", { screenSecurityContract: 2, verifiedOnUiThread: true, secure: true }],
  ["early ACK", { screenSecurityContract: 1, verifiedOnUiThread: false, secure: true }],
  ["flag absent", { screenSecurityContract: 1, verifiedOnUiThread: true, secure: false }],
  ["string version", { screenSecurityContract: "1", verifiedOnUiThread: true, secure: true }],
]) test(`old/incompatible native + new frontend stays closed: ${name}`, async () => {
  assert.deepEqual(await apply({ enable: async () => response }, true), { success: false, updateRequired: true });
});
test("plugin/method missing requires update", async () => {
  for (const plugin of [{}, { enable: async () => { throw Object.assign(Error(), { code: "UNIMPLEMENTED" }); } }]) {
    assert.deepEqual(await apply(plugin, true), { success: false, updateRequired: true });
  }
});
test("new native + new frontend verifies both transitions", async () => {
  for (const enabled of [true, false]) {
    const plugin = { [enabled ? "enable" : "disable"]: async () => ({ screenSecurityContract: 1, verifiedOnUiThread: true, secure: enabled }) };
    assert.deepEqual(await apply(plugin, enabled), { success: true, updateRequired: false });
  }
});
test("new native response remains usable by old frontend awaiting void", async () => {
  let applied = false;
  const plugin = { enable: async () => { applied = true; return { screenSecurityContract: 1, verifiedOnUiThread: true, secure: true }; } };
  await plugin.enable(); // Previous frontend ignores the payload, but ACK still follows application.
  assert.equal(applied, true);
});
test("known native runtime failures allow retry without success", async () => {
  for (const code of ["SCREEN_SECURITY_UNAVAILABLE", "SCREEN_SECURITY_FAILED", "SCREEN_SECURITY_VERIFY_FAILED"]) {
    assert.deepEqual(await apply({ enable: async () => { throw Object.assign(Error(), { code }); } }, true),
      { success: false, updateRequired: false });
  }
});
test("unresponsive native times out closed; late ACK cannot grant readiness", async () => {
  let resolve;
  const result = await apply({ enable: () => new Promise(r => { resolve = r; }) }, true, 10);
  resolve({ screenSecurityContract: 1, verifiedOnUiThread: true, secure: true });
  await Promise.resolve();
  assert.deepEqual(result, { success: false, updateRequired: true });
});
