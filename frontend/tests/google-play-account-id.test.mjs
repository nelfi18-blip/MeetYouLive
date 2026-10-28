import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveGooglePlayAccountId } from "../lib/googlePlayAccount.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const okResponse = (body) => ({ ok: true, status: 200, json: async () => body });
const statusResponse = (status) => ({ ok: false, status, json: async () => ({}) });

test("NextAuth session: accountId comes from the backend user the token authenticates", async () => {
  let call;
  const fetchImpl = async (url, opts) => {
    call = { url, opts };
    return okResponse({ _id: "user-from-jwt", role: "user" });
  };
  const result = await resolveGooglePlayAccountId("nextauth-backend-token", "https://api.test", fetchImpl);
  assert.deepEqual(result, { accountId: "user-from-jwt" });
  assert.equal(call.url, "https://api.test/api/user/me");
  assert.equal(call.opts.headers.Authorization, "Bearer nextauth-backend-token");
});

test("JWT-only session (no NextAuth id): accountId is still resolved from /me", async () => {
  const result = await resolveGooglePlayAccountId("local-jwt", "https://api.test", async () =>
    okResponse({ id: 12345 })
  );
  assert.deepEqual(result, { accountId: "12345" });
});

test("missing token or rejected token is an auth error", async () => {
  assert.deepEqual(await resolveGooglePlayAccountId(null, "x", async () => assert.fail("no fetch")), { error: "auth" });
  for (const status of [401, 403, 404]) {
    assert.deepEqual(
      await resolveGooglePlayAccountId("t", "x", async () => statusResponse(status)),
      { error: "auth" }
    );
  }
});

test("user payload without an id is an auth error", async () => {
  assert.deepEqual(await resolveGooglePlayAccountId("t", "x", async () => okResponse({})), { error: "auth" });
});

test("network failures, 5xx and bad JSON are network errors", async () => {
  assert.deepEqual(
    await resolveGooglePlayAccountId("t", "x", async () => {
      throw new TypeError("Failed to fetch");
    }),
    { error: "network" }
  );
  assert.deepEqual(await resolveGooglePlayAccountId("t", "x", async () => statusResponse(500)), { error: "network" });
  assert.deepEqual(
    await resolveGooglePlayAccountId("t", "x", async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("bad");
      },
    })),
    { error: "network" }
  );
});

test("coins page resolves identity before launching Google Play and no longer uses session.user.id", async () => {
  const src = await readFile(join(__dirname, "../app/coins/page.jsx"), "utf8");
  const start = src.indexOf("const buyWithGooglePlay");
  const body = src.slice(start, src.indexOf("const buy = async", start));
  assert.ok(!body.includes("session?.user?.id"));
  const resolveIdx = body.indexOf("resolveGooglePlayAccountId(");
  const purchaseIdx = body.indexOf("purchaseCoinPackageWithGooglePlay(");
  assert.ok(resolveIdx >= 0 && resolveIdx < purchaseIdx);
  assert.ok(body.includes('t("coins.authError")'));
  assert.ok(body.includes('t("coins.connectionError")'));
  assert.match(body, /purchaseCoinPackageWithGooglePlay\(pkg, accountId\)/);
});
