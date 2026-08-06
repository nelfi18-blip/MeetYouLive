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
import { isBottomNavRoute } from "../lib/bottomNavRoutes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const bottomNavPath = join(__dirname, "../components/BottomNavEnhanced.jsx");

const USER_BOTTOM_NAV_DESTINATIONS = ["/dashboard", "/feed", "/chats", "/profile"];
const CREATOR_BOTTOM_NAV_DESTINATIONS = ["/creator", "/feed", "/chats", "/settings"];

function assertDistinctDestinations(destinations) {
  assert.deepEqual(new Set(destinations).size, destinations.length);
}

test("Home resolves by role", () => {
  assert.equal(getHomePath("creator"), "/creator");
  assert.equal(getHomePath("subCreator"), "/creator");
  assert.equal(getHomePath("admin"), "/admin");
  assert.equal(getHomePath("user"), "/dashboard");
  assert.equal(getHomePath(null), "/");
  assert.equal(getHomePath("moderator"), "/dashboard");
});

test("Community/Discover bottom nav keeps the discovery feed destination", async () => {
  const source = await readFile(bottomNavPath, "utf8");

  assert.match(source, /<Link href=\{homePath\}/);
  assert.match(source, /<Link href="\/feed"[^>]*>\s*<svg/s);
  assert.match(source, /isActive\("\/feed"\) \|\| isActive\("\/explore"\)/);
});

test("Home and Community have distinct destinations for user and creator", () => {
  assert.notEqual(getHomePath("user"), "/feed");
  assert.notEqual(getHomePath("creator"), "/feed");
  assert.notEqual(getHomePath("subCreator"), "/feed");
  assert.equal(getHomePath("user"), USER_BOTTOM_NAV_DESTINATIONS[0]);
  assert.equal(getHomePath("creator"), CREATOR_BOTTOM_NAV_DESTINATIONS[0]);
  assert.equal(getHomePath("subCreator"), CREATOR_BOTTOM_NAV_DESTINATIONS[0]);
  assert.equal(USER_BOTTOM_NAV_DESTINATIONS[1], "/feed");
  assert.equal(CREATOR_BOTTOM_NAV_DESTINATIONS[1], "/feed");
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

test("bottom nav stays off immersive live routes", () => {
  assert.equal(isBottomNavRoute("/live"), true);
  assert.equal(isBottomNavRoute("/live/start"), false);
  assert.equal(isBottomNavRoute("/live/room-123"), false);
});

test("protected route callbacks normalize without redirect loops", () => {
  assert.equal(DEFAULT_AUTH_REDIRECT, "/feed");
  assert.equal(normalizeCallbackPath("/dashboard"), "/dashboard");
  assert.equal(normalizeCallbackPath("/feed"), "/feed");
  assert.equal(normalizeCallbackPath("/explore"), "/explore");
  assert.equal(normalizeCallbackPath("/login?callbackUrl=/dashboard"), "/feed");
  assert.equal(normalizeCallbackPath("/register?callbackUrl=/feed"), "/feed");
});
