import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getHomePath } from "../lib/navigationPaths.js";
import {
  DEFAULT_AUTH_REDIRECT,
  normalizeCallbackPath,
} from "../lib/redirects.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const bottomNavPath = join(__dirname, "../components/BottomNavEnhanced.jsx");

const USER_BOTTOM_NAV_DESTINATIONS = ["/dashboard", "/feed", "/chats", "/profile"];
const CREATOR_BOTTOM_NAV_DESTINATIONS = ["/creator", "/feed", "/chats", "/settings"];

function assertDistinctDestinations(destinations) {
  assert.deepEqual(new Set(destinations).size, destinations.length);
}

test("Home/Dashboard resolves to the dashboard, not the discovery feed", () => {
  assert.equal(getHomePath("user"), "/dashboard");
  assert.equal(getHomePath("creator"), "/dashboard");
  assert.equal(getHomePath("moderator"), "/dashboard");
  assert.notEqual(getHomePath("user"), "/feed");
});

test("Community/Discover bottom nav keeps the discovery feed destination", async () => {
  const source = await readFile(bottomNavPath, "utf8");

  assert.match(source, /<Link href=\{homePath\}/);
  assert.match(source, /<Link href="\/feed"[^>]*>\s*<svg/s);
  assert.match(source, /isActive\("\/feed"\) \|\| isActive\("\/explore"\)/);
});

test("bottom nav destinations stay distinct and expected by role", () => {
  assertDistinctDestinations(USER_BOTTOM_NAV_DESTINATIONS);
  assertDistinctDestinations(CREATOR_BOTTOM_NAV_DESTINATIONS);

  assert.deepEqual(USER_BOTTOM_NAV_DESTINATIONS, [
    "/dashboard",
    "/feed",
    "/chats",
    "/profile",
  ]);
  assert.deepEqual(CREATOR_BOTTOM_NAV_DESTINATIONS, [
    "/creator",
    "/feed",
    "/chats",
    "/settings",
  ]);
});

test("protected route callbacks normalize without redirect loops", () => {
  assert.equal(DEFAULT_AUTH_REDIRECT, "/feed");
  assert.equal(normalizeCallbackPath("/dashboard"), "/dashboard");
  assert.equal(normalizeCallbackPath("/feed"), "/feed");
  assert.equal(normalizeCallbackPath("/explore"), "/explore");
  assert.equal(normalizeCallbackPath("/login?callbackUrl=/dashboard"), "/feed");
  assert.equal(normalizeCallbackPath("/register?callbackUrl=/feed"), "/feed");
});
