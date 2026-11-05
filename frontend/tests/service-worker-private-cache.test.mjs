import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const script = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");

function harness() {
  const callbacks = new Map();
  const stores = new Map();
  let online = true;
  const responses = new Map();
  const key = (request) => typeof request === "string" ? request : request.url;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const cache = stores.get(name);
      return {
        async addAll(paths) {
          for (const path of paths) cache.set(path, new Response(path === "/offline" ? "OFFLINE_PAGE" : "PUBLIC_ASSET"));
        },
        async put(request, response) { cache.set(key(request), response.clone()); },
      };
    },
    async match(request) {
      for (const cache of stores.values()) {
        const match = cache.get(key(request));
        if (match) return match.clone();
      }
      return undefined;
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  const self = {
    location: { origin: "https://app.example", href: "https://app.example/sw.js" },
    addEventListener(name, cb) { callbacks.set(name, cb); },
    skipWaiting() {},
    clients: { claim() {} },
    registration: {},
  };
  const fetch = async (req) => {
    if (!online) throw new Error("OFFLINE");
    return new Response(responses.get(key(req)) ?? "ONLINE_PAGE", { status: 200 });
  };
  vm.runInNewContext(script, {
    self, caches, fetch, URL, URLSearchParams, Response, Promise,
    importScripts() { throw new Error("Firebase unavailable in isolated test"); },
  });
  async function fire(name, eventFields = {}) {
    const pending = [];
    let response;
    callbacks.get(name)({
      ...eventFields,
      respondWith(value) { response = Promise.resolve(value); },
      waitUntil(value) { pending.push(Promise.resolve(value)); },
    });
    if (response) {
      const result = await response;
      await Promise.all(pending);
      return result;
    }
    await Promise.all(pending);
  }
  const request = (path, mode = "navigate", accept = "text/html") => ({
    url: "https://app.example" + path,
    method: "GET",
    mode,
    headers: { get(name) { return name.toLowerCase() === "accept" ? accept : null; } },
  });
  return { fire, request, caches, stores, responses,
    setOnline(value) { online = value; } };
}

test("offline precache excludes the potentially session-dependent root page", async () => {
  const h = harness();
  await h.fire("install");
  assert.equal(await h.caches.match("/"), undefined);
  assert.equal(await (await h.caches.match("/offline")).text(), "OFFLINE_PAGE");
});

test("account switching never recovers a previous user's page while offline", async () => {
  const h = harness();
  await h.fire("install");
  const req = h.request("/wallet");
  h.responses.set(req.url, "ACCOUNT_A_BALANCE");
  assert.equal(await (await h.fire("fetch", { request: req })).text(), "ACCOUNT_A_BALANCE");
  h.setOnline(false);
  assert.equal(await (await h.fire("fetch", { request: req })).text(), "OFFLINE_PAGE");
  assert.equal(await h.caches.match(req), undefined);
});

test("chat and notification GETs never cache account-scoped API content", async () => {
  const h = harness();
  await h.fire("install");
  for (const route of ["/api/chats", "/api/notifications", "/api/auth/session"]) {
    const req = h.request(route, "cors", "application/json");
    h.setOnline(true);
    h.responses.set(req.url, "ACCOUNT_A_PRIVATE_JSON");
    assert.equal(await (await h.fire("fetch", { request: req })).text(), "ACCOUNT_A_PRIVATE_JSON");
    h.setOnline(false);
    const fallback = await h.fire("fetch", { request: req });
    assert.equal(fallback.status, 503);
    assert.equal((await fallback.json()).offline, true);
    assert.equal(await h.caches.match(req), undefined);
  }
});

test("public immutable assets still use offline cache", async () => {
  const h = harness();
  await h.fire("install");
  const req = h.request("/_next/static/chunks/app.123.js", "cors", "text/javascript");
  h.responses.set(req.url, "ASSET_V1");
  assert.equal(await (await h.fire("fetch", { request: req })).text(), "ASSET_V1");
  h.setOnline(false);
  assert.equal(await (await h.fire("fetch", { request: req })).text(), "ASSET_V1");
});

test("new cache version evicts old private entries on activation", async () => {
  const h = harness();
  const old = await h.caches.open("meetyoulive-v42");
  await old.put(h.request("/settings"), new Response("PRIOR_USER_SETTINGS"));
  await h.fire("install");
  await h.fire("activate");
  assert.equal(h.stores.has("meetyoulive-v42"), false);
  assert.equal(await h.caches.match(h.request("/settings")), undefined);
});
