import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";
import {
  getUniverseReturnPlacement, needsUniverseReturnConfirmation,
} from "../lib/universeReturnPolicy.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(join(root, path), "utf8");

test("globe is available from existing app pages and floats clear of mobile bottom bar", async () => {
  for (const path of ["/feed","/dashboard","/chats","/chats/abc","/profile",
    "/settings","/notifications","/coins","/vip","/subscription",
    "/gifts","/passes","/creator","/live"]) {
    assert.equal(getUniverseReturnPlacement(path), "above-nav", path);
  }
  for (const path of ["/rooms","/referral","/agency","/wallet","/creator-request"]) {
    assert.equal(getUniverseReturnPlacement(path), "compact", path);
  }
  for (const path of ["/random","/live/start","/live/abc","/call/abc","/calls/abc","/private-calls"]) {
    assert.equal(getUniverseReturnPlacement(path), "immersive", path);
  }
  const component = await read("components/UniverseReturnFloat.jsx");
  const css = await read("components/UniverseReturnFloat.module.css");
  const layout = await read("app/layout.jsx");
  assert.doesNotThrow(() => parse(component, { sourceType: "module", plugins: ["jsx"] }));
  assert.match(layout, /import UniverseReturnFloat from "\.\.\/components\/UniverseReturnFloat"/);
  assert.match(layout, /<UniverseReturnFloat \/>/);
  assert.match(component, /router\.push\("\/universe"\)/);
  assert.match(component, /getToken\(\)/);
  assert.match(component, /session\?\.backendToken/);
  assert.match(component, /aria-label=\{copy\.label\}/);
  assert.match(component, /BACKEND_TOKEN_READY_EVENT/);
  assert.match(css, /\.abovenav \{ bottom: calc\(94px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /\.immersive \{/);
});

test("return globe never leaks into auth, registration, public preview, admin or onboarding", () => {
  for (const path of [null,"","/","/login","/register","/onboarding",
    "/universe","/universe-preview","/auth/success","/admin",
    "/admin/revenue","/dev","/terms","/help-center","/pricing"]) {
    assert.equal(getUniverseReturnPlacement(path), null, String(path));
  }
});

test("active calls, streams and random video require confirmation before leaving", async () => {
  for (const path of ["/random","/live/start","/live/session123",
    "/call/session123","/calls/session123","/private-calls"]) {
    assert.equal(needsUniverseReturnConfirmation(path), true, path);
  }
  for (const path of ["/feed","/chats","/profile","/coins","/rooms"]) {
    assert.equal(needsUniverseReturnConfirmation(path), false, path);
  }
  const component = await read("components/UniverseReturnFloat.jsx");
  assert.match(component, /window\.confirm\(copy\.warning\)/);
  assert.match(component, /needsUniverseReturnConfirmation\(pathname\)/);
  assert.match(component, /if \(!placement \|\| !\(hasBackendToken \|\| session\?\.backendToken\)\) return null/);
});

test("preview explains login, existing users go to universe, and new users find current register route", async () => {
  const scene = await read("components/ExploreCarousel3D.jsx");
  const preview = await read("app/universe-preview/page.jsx");
  const real = await read("app/universe/page.jsx");
  const login = await read("app/login/page.jsx");
  const onboarding = await read("app/onboarding/page.jsx");
  const css = await read("components/ExploreCarousel3D.module.css");
  assert.match(preview, /<ExploreCarousel3D previewMode \/>/);
  assert.match(real, /<ExploreCarousel3D \/>/);
  assert.match(scene, /if \(previewMode && !\(getToken\(\) \|\| session\?\.backendToken\)\)/);
  assert.match(scene, /setPreviewTarget\(route\)/);
  assert.match(scene, /router\.push\(route\)/);
  assert.match(scene, /router\.push\("\/login\?callbackUrl=%2Funiverse"\)/);
  assert.match(scene, /openDestination\(activeExperience\.route\)/);
  assert.match(css, /\.previewGateOverlay \{/);
  assert.match(css, /\.previewGateLogin \{/);
  assert.match(login, /className="new-account-shortcut"/);
  assert.match(login, /<Link href="\/register">/);
  assert.equal((login.match(/href="\/register"/g) || []).length, 1);
  assert.match(onboarding, /router\.replace\("\/universe"\)/);
});
