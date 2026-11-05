// Isolated local harness for the REAL renderer, physics, client and JWT socket
// protocol. It does not mount the whole application or claim real phone users.
import { build } from "esbuild";
import { chromium } from "playwright";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "../backend/package.json"));
const mongoose = require("mongoose"), jwt = require("jsonwebtoken");
const uri = process.env.INTEGRATION_MONGO_URI;
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(uri || "")) throw new Error("Disposable localhost MongoDB required");
process.env.JWT_SECRET = "vcr-browser-synthetic-local-only";
const artifacts = process.env.VCR_BROWSER_ARTIFACTS || "/tmp/vcr-browser-artifacts";
await mkdir(artifacts, { recursive: true });
let io, server, browser, accounts = [], timers = [];
const results = { fixture: "two synthetic authenticated accounts; desktop Chromium and mobile viewport, not physical phones", checks: [] };
try {
  await mongoose.connect(uri, { autoIndex: false });
  const User = require("../backend/src/models/User.js");
  const nonce = Date.now();
  accounts = await Promise.all(["a", "b"].map((id) => User.create({ username: `vcr_browser_${id}_${nonce}`,
    email: `vcr-${id}-${nonce}@example.invalid`, password: "synthetic-local-fixture" })));
  const bundled = await build({ write: false, bundle: true, format: "iife", platform: "browser", resolveExtensions: [".js", ".cjs"],
    stdin: { resolveDir: root, contents: `
      import * as THREE from 'three';
      import { io } from 'socket.io-client';
      import { createVcrDistrict } from './lib/vcr/districtWorld.js';
      import { createVcrPresence } from './lib/vcr/presence.js';
      (async()=>{
      window.fixture = { state: 'solo', peers: [], instance: null };
      const world = createVcrDistrict(THREE, document.querySelector('canvas'), {onContextLost: () => { window.fixture.contextLost = true; session.leave(); }});
      const token = await fetch('/token?user=' + new URLSearchParams(location.search).get('user')).then(r => r.json());
      const socket = io(location.origin + '/vcr', {autoConnect:false, auth: {token: token.token}, transports:['websocket']});
      const session = createVcrPresence({ socket, world,
        onState: state => { window.fixture.state = state; }, onPeers: peers => { window.fixture.peers = peers; },
        onInstance: id => { window.fixture.instance = id; } });
      socket.on('connect_error', error => { window.fixture.connectionError = error.message; });
      Object.assign(window.fixture, {world, socket, session});
      document.querySelector('#join').onclick = () => session.join(world.inspect().country, 'violet');
      document.querySelector('#leave').onclick = () => session.leave();
      document.querySelector('#move').onpointerdown = () => world.setDirection('forward',true);
      document.querySelector('#move').onpointerup = document.querySelector('#move').onpointercancel = () => world.setDirection('forward',false);
      document.querySelector('#country').onchange = e => session.changeCountry(e.target.value);
      window.fixture.ready = true;
    })();` },
  });
  const bundle = bundled.outputFiles[0].contents;
  server = createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/bundle.js") { response.setHeader("Content-Type", "application/javascript"); response.end(bundle); return; }
    if (url.pathname === "/token") {
      const account = accounts[url.searchParams.get("user") === "b" ? 1 : 0];
      response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ token: jwt.sign({ id: String(account._id) }, process.env.JWT_SECRET, { expiresIn: "10m" }) })); return;
    }
    response.setHeader("Content-Type", "text/html");
    response.end(`<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><title>VCR synthetic browser check</title>
      <style>body{margin:0;background:#111;color:white;font:16px sans-serif}canvas{display:block;width:100vw;height:calc(100svh - 65px);touch-action:none}nav{height:65px;display:flex;align-items:center;gap:6px;padding:0 6px;box-sizing:border-box}button,select{min-height:44px;min-width:44px;font-size:14px}</style>
      <canvas aria-label="VCR world"></canvas><nav><button id="join">Enter</button><button id="leave">Leave</button><button id="move">Walk</button><select id="country">${["us", "fr", "jp", "ae", "br", "eg"].map((id) => `<option>${id}</option>`).join("")}</select></nav><script src="/bundle.js"></script></html>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = `http://127.0.0.1:${server.address().port}`;
  process.env.FRONTEND_URL = address; // Local fixture origin; production CORS stays unchanged.
  const originalInterval = globalThis.setInterval;
  globalThis.setInterval = (...args) => { const timer = originalInterval(...args); timers.push(timer); return timer; };
  try { io = require("../backend/src/lib/socket.js").initSocket(server); } finally { globalThis.setInterval = originalInterval; }
  browser = await chromium.launch({ headless: true, ...(process.env.VCR_CHROMIUM_PATH ? { executablePath: process.env.VCR_CHROMIUM_PATH } : {}),
    args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const errors = []; results.browserErrors = errors;
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const a = await desktop.newPage(), b = await mobile.newPage();
  for (const page of [a, b]) page.on("pageerror", (error) => { errors.push(error.message); console.error("Browser:", error.message); });
  await Promise.all([a.goto(address + "/?user=a"), b.goto(address + "/?user=b")]);
  for (const page of [a, b]) await page.waitForFunction(() => window.fixture?.ready, null, { timeout: 15000 });
  await a.locator("#join").click(); await b.locator("#join").click();
  for (const page of [a, b]) await page.waitForFunction(() => window.fixture.state === "online" && window.fixture.world.inspect().peers === 1);
  assert.equal(await a.evaluate(() => window.fixture.instance), await b.evaluate(() => window.fixture.instance));
  results.checks.push("Two authenticated synthetic accounts share one server instance and render each other's avatar");
  const before = await a.evaluate(() => window.fixture.world.inspect());
  await a.keyboard.down("w"); await a.waitForTimeout(650); await a.keyboard.up("w");
  const moved = await a.evaluate(() => window.fixture.world.inspect());
  assert.ok(Math.hypot(moved.position.x - before.position.x, moved.position.z - before.position.z) > 0.1);
  const aliceId = String(accounts[0]._id);
  await b.waitForFunction((id) => { const p = window.fixture.world.inspect().peerPositions[id]; return p && Math.hypot(p.x, p.z) > 0.1; }, aliceId);
  results.checks.push("Keyboard movement is visible in the other browser over real Socket.IO");
  await a.mouse.move(650, 350); await a.mouse.down(); await a.mouse.move(850, 420, { steps: 8 }); await a.mouse.up(); await a.waitForTimeout(200);
  const camera = await a.evaluate(() => window.fixture.world.inspect().camera);
  assert.ok(camera.some((v, i) => Math.abs(v - moved.camera[i]) > 0.1)); results.checks.push("Third-person camera drag changes the rendered camera");
  const mobileBefore = await b.evaluate(() => window.fixture.world.getPosition());
  await b.locator("#move").dispatchEvent("pointerdown", { pointerId: 1 }); await b.waitForTimeout(500);
  await b.locator("#move").dispatchEvent("pointercancel", { pointerId: 1 });
  const stopped = await b.evaluate(() => window.fixture.world.getPosition());
  await b.waitForTimeout(200); const afterStop = await b.evaluate(() => window.fixture.world.getPosition());
  assert.ok(Math.hypot(stopped.x - mobileBefore.x, stopped.z - mobileBefore.z) > 0.1);
  assert.ok(Math.hypot(afterStop.x - stopped.x, afterStop.z - stopped.z) < 0.01);
  assert.equal(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  results.checks.push("390px mobile viewport: touch walking, pointer cancellation and no horizontal overflow");
  await a.screenshot({ path: path.join(artifacts, "us-desktop.png") }); await b.screenshot({ path: path.join(artifacts, "us-mobile.png") });
  await a.waitForTimeout(800); await a.locator("#country").selectOption("fr");
  await a.waitForFunction(() => window.fixture.state === "online" && window.fixture.world.inspect().country === "fr");
  await b.waitForFunction(() => window.fixture.world.inspect().peers === 0);
  await b.locator("#country").selectOption("fr");
  for (const page of [a, b]) await page.waitForFunction(() => window.fixture.state === "online" && window.fixture.world.inspect().peers === 1);
  results.checks.push("Changing countries removes old presence and reassembles a shared destination");
  await a.evaluate(() => window.fixture.socket.disconnect());
  await b.waitForFunction(() => window.fixture.world.inspect().peers === 0);
  await a.evaluate(() => window.fixture.socket.connect());
  for (const page of [a, b]) await page.waitForFunction(() => window.fixture.state === "online" && window.fixture.world.inspect().peers === 1);
  results.checks.push("Disconnect/reconnect removes stale avatars and establishes fresh membership");
  await User.updateOne({ _id: accounts[0]._id }, { $addToSet: { blockedUsers: accounts[1]._id } });
  for (const page of [a, b]) await page.waitForFunction(() => window.fixture.world.inspect().peers === 0);
  results.checks.push("A database block hides both avatars in the rendered worlds");
  await a.locator("#leave").click(); await b.locator("#leave").click();
  for (const country of ["fr", "jp", "ae", "br", "eg"]) {
    await b.locator("#country").selectOption(country); await b.waitForTimeout(180);
    assert.equal(await b.evaluate(() => window.fixture.world.inspect().country), country);
    await b.screenshot({ path: path.join(artifacts, `${country}-mobile.png`) });
  }
  results.checks.push("All six actual WebGL destinations rendered with mobile screenshots");
  await b.evaluate(() => document.querySelector("canvas").getContext("webgl2").getExtension("WEBGL_lose_context").loseContext());
  await b.waitForFunction(() => window.fixture.contextLost === true);
  results.checks.push("WebGL context loss stops the world and leaves shared presence");
  assert.deepEqual(errors, []); results.success = true;
  console.log(JSON.stringify(results, null, 2));
} finally {
  await writeFile(path.join(artifacts, "results.json"), JSON.stringify(results, null, 2));
  await browser?.close(); timers.forEach(clearInterval);
  if (io) await new Promise((resolve) => io.close(resolve));
  if (mongoose.connection.readyState) {
    if (accounts.length) await require("../backend/src/models/User.js").deleteMany({ _id: { $in: accounts.map((a) => a._id) } });
    await mongoose.disconnect();
  }
}
