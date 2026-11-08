import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (name) => readFile(new URL(name, import.meta.url), "utf8");

test("World pilot cannot navigate to production routes through preview middleware", async () => {
  const code = await source("../middleware.js");
  assert.ok(code.includes('process.env.NEXT_PUBLIC_WORLD_TEST_MODE === "isolated"'));
  assert.ok(code.includes('pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/")'));
  assert.ok(code.includes('pathname === "/login" || pathname === "/vcr"'));
  assert.ok(code.includes('url.search = "?callbackUrl=%2Fvcr"'));
});

test("World pilot login is limited to two synthetic accounts and hides social providers", async () => {
  const code = await source("../app/login/page.jsx");
  assert.ok(code.includes('WORLD_TEST_ONLY = process.env.NEXT_PUBLIC_WORLD_TEST_MODE === "isolated"'));
  assert.ok(code.includes('world-pilot-a@example.invalid'));
  assert.ok(code.includes('world-pilot-b@example.invalid'));
  assert.ok(code.includes("!WORLD_TEST_ONLY && <AppleSignInButton"));
  assert.ok(code.includes('!WORLD_TEST_ONLY && <button'));
  assert.ok(code.includes('if (WORLD_TEST_ONLY) return "/vcr"'));
  const auth = await source("../lib/authOptions.js");
  assert.ok(auth.includes('return process.env.NEXT_PUBLIC_WORLD_TEST_MODE !== "isolated"'));
});

test("World pilot does not start shared chat/live socket manager", async () => {
  const providers = await source("../app/providers.jsx");
  assert.ok(providers.includes('process.env.NEXT_PUBLIC_WORLD_TEST_MODE !== "isolated" && <SocketManager />'));
});

test("World pilot consent notice is localized", async () => {
  for(const lang of ["es","en","pt"]){
    const data=JSON.parse(await source(`../messages/${lang}.json`));
    assert.ok(data.vcrWorld.testLoginNotice?.length>40);
  }
});
