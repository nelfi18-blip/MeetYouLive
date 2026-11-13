import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { getDisplayName } from "../lib/imageHelpers.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFile(resolve(here, "..", path), "utf8");

test("legacy full names show only the given name, never the surname or email-derived username", () => {
  assert.equal(getDisplayName({ role: "user", name: "María Rodríguez", username: "maria.rodriguez1987" }), "María");
  assert.equal(getDisplayName({ username: "emailprefix123" }), "Usuario");
  assert.equal(getDisplayName({ name: "Francisco Javier López" }), "Francisco");
});

test("chosen nicknames take priority and creators keep multiword artistic names", () => {
  assert.equal(getDisplayName({ publicName: "Estrella", name: "María Rodríguez" }), "Estrella");
  assert.equal(getDisplayName({ publicName: "DJ Estrella" }), "DJ Estrella");
  assert.equal(getDisplayName({ role: "creator", creatorProfile: { displayName: "Luna Latina" }, name: "María Rodríguez" }), "Luna Latina");
});

test("the profile editor lets users set publicName separately from account name", async () => {
  const source = await read("app/profile/page.jsx");
  assert.match(source, /publicName: editForm\.publicName/);
  assert.match(source, /profile\.publicNameLabel/);
  assert.match(source, /profile\.publicNameHelp/);
});

test("other users' public-profile UI does not show the internal account handle", async () => {
  const page = await read("app/profile/[id]/page.jsx");
  const header = await read("components/ProfileHeader.jsx");
  assert.doesNotMatch(page, /\{username && <p>\{username\}<\/p>\}/);
  assert.doesNotMatch(header, /@\{user\.username\}/);
});
