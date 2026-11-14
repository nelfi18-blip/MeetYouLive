import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(join(root, path), "utf8");

test("universe has no Skip/Omitir button and keeps cards routing to existing screens", async () => {
  const scene = await read("components/ExploreCarousel3D.jsx");
  const css = await read("components/ExploreCarousel3D.module.css");
  assert.doesNotThrow(() => parse(scene, { sourceType: "module", plugins: ["jsx"] }));
  assert.doesNotMatch(scene, /styles\.skip|copy\.skip|skip: "Omitir"|skip: "Skip"|skip: "Pular"/);
  assert.doesNotMatch(css, /\.skip\s*\{|\.headerBrandRow \.skip/);
  assert.match(css, /grid-template-areas:[\s\S]*?"\. controls"[\s\S]*?"brand brand"/);
  assert.match(scene, /<UniverseAccountMenu lang=\{lang\} \/>/);
  assert.match(scene, /id: "connect", route: "\/feed"/);
  assert.match(scene, /onClick=\{\(\) => pressCard\(index\)\}/);
  assert.match(scene, /openDestination\(activeExperience\.route\)/);
});

test("universe menu exposes localized logout only to signed-in users", async () => {
  const source = await read("components/UniverseAccountMenu.jsx");
  const css = await read("components/ExploreCarousel3D.module.css");
  assert.doesNotThrow(() => parse(source, { sourceType: "module", plugins: ["jsx"] }));
  assert.match(source, /logout: "Cerrar sesión"/);
  assert.match(source, /logout: "Sign out"/);
  assert.match(source, /logout: "Sair da conta"/);
  assert.match(source, /identity\.authenticated && !identity\.admin/);
  assert.match(source, /className=\{styles\.accountMenuLogout\}/);
  assert.match(source, /disabled=\{loggingOut\}/);
  assert.match(source, /onClick=\{handleLogout\}/);
  assert.match(css, /\.accountMenuLogout \{/);
  assert.match(css, /\.accountMenuLogout:focus-visible \{/);
});

test("logout reuses the established navigation session clean-up without touching login or payments", async () => {
  const source = await read("components/UniverseAccountMenu.jsx");
  const navbar = await read("components/Navbar.jsx");
  const token = await read("lib/token.js");
  assert.match(source, /socket\.disconnect\(\)/);
  assert.match(source, /clearAllAuth\(\{ switching: false \}\)/);
  assert.match(source, /await signOut\(\{ redirect: false \}\)/);
  assert.match(source, /router\.replace\("\/login"\)/);
  assert.match(navbar, /socket\.disconnect\(\);\s*clearAllAuth\(\{ switching: false \}\);\s*await signOut\(\{ redirect: false \}\);\s*router\.replace\("\/login"\)/);
  assert.ok(token.includes("document.cookie = `${COOKIE_NAME}=;"));
  assert.doesNotMatch(source, /purchaseCoinPackageWithGooglePlay|purchaseCoinPackageWithApple|Stripe/);
});
