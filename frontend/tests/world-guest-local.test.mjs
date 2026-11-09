import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import rules from "../../backend/src/lib/vcrWorldRules.cjs";

const source = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("one-tap guest demo exists in test-only World and test-only login", async () => {
  const [page, login, middleware] = await Promise.all([
    source("app/vcr/page.jsx"),
    source("app/login/page.jsx"),
    source("middleware.js"),
  ]);
  assert.match(page, /WORLD_TEST_ONLY && !walkSession/);
  assert.match(page, /localDemo: true/);
  assert.match(page, /onClick=\{\(\) => setWalkSession/);
  assert.match(page, /worldPhoto\.guestDemoDescription/);
  assert.match(login, /WORLD_TEST_ONLY && \(/);
  assert.match(login, /href="\/vcr"/);
  assert.match(login, /worldPhoto\.guestDemoButton/);
  assert.match(middleware, /NEXT_PUBLIC_WORLD_TEST_MODE === "isolated"[\s\S]*pathname === "\/vcr"/);
  assert.match(middleware, /X-Robots-Tag", "noindex, nofollow"/);
  assert.doesNotMatch(page, /password|WORLD_TEST_ACCOUNT_[AB]_PASSWORD/);
});

test("guest movement never creates a JWT, socket, peer audience or AI entitlement", async () => {
  const code = await source("components/vcr/WalkableWorld.jsx");
  const head = code.indexOf("if (demo) {");
  const socket = code.indexOf("const socket = io(");
  assert.ok(head >= 0 && socket > head, "local guest must branch before socket");
  assert.match(code.slice(head, socket), /world\.setInputEnabled\(true\)/);
  assert.match(code.slice(head, socket), /return;/);
  assert.match(code, /const demo = ISOLATED_WORLD && localDemo === true/);
  assert.match(code, /const token = demo \? null : getToken\(\) \|\| initialToken/);
  assert.match(code, /if \(!demo && !token\)/);
  assert.match(code, /if \(demo \|\| !ISOLATED_WORLD/);
  assert.match(code, /if \(demo\) worldRef\.current\?\.travelCountry\(id\)/);
  assert.match(code, /const canInteract = renderStatus === "ready"/);
  assert.match(code, /presence === "online" \|\| \(demo && presence === "local"\)/);
  assert.match(code, /demo \? t\("worldPhoto\.guestDemoStatus"\)/);
  assert.match(code, /t\("worldPhoto\.guestDemoNotice"\)/);
  const executableGuestBranch = code.slice(head, socket)
    .split("\n").map(line => line.split("//")[0]).join("\n");
  for (const prohibited of ["fetch(", "emit(", "Bearer", "auth:"]) {
    assert.equal(executableGuestBranch.includes(prohibited), false, prohibited);
  }
  // The main authenticated path still exists for social presence.
  assert.match(code, /session\.join\(initialCountry, "violet", sharePhoto\)/);
  assert.match(code, /world\.setInputEnabled\(state === "online"\)/);
});

test("guest test movement uses existing real collision and all six countries", () => {
  for (const country of Object.keys(rules.DESTINATIONS)) {
    const start = { x: 0, z: 0, yaw: 0 };
    assert.equal(rules.walkable(country, 0, 0), true);
    let position = start;
    for (let i = 0; i < 6; i++) position = rules.step(country, position, { forward: true, yaw: 0 }, 0.05);
    assert.ok(position.z < start.z, country + " requires real movement");
    assert.equal(position.moving, true);
  }
});

test("guest notices are localized and do not pretend to be the real AI World", async () => {
  const records = await Promise.all(["es", "en", "pt"].map(async (lang) =>
    JSON.parse(await source("messages/" + lang + ".json"))));
  for (const item of records) {
    for (const key of ["guestDemoButton", "guestDemoDescription", "guestDemoStatus", "guestDemoNotice"]) {
      assert.ok(item.worldPhoto[key]?.length >= 10, key);
    }
  }
  assert.match(records[0].worldPhoto.guestDemoDescription, /no es el World IA fotorrealista/i);
  const keys = records.map(r => Object.keys(r.worldPhoto).sort().join("|"));
  assert.equal(keys[0], keys[1]);
  assert.equal(keys[1], keys[2]);
});
