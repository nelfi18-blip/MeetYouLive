import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isProtectedRoutePath,
  isPublicRoute,
  shouldRedirectUnauthenticatedToLogin,
} from "../lib/publicAccess.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const componentsDir = join(__dirname, "..", "components", "gifts", "previews");
const pagePath = join(
  __dirname,
  "..",
  "app",
  "dev",
  "gift-animations-preview",
  "page.jsx"
);
const layoutPath = join(
  __dirname,
  "..",
  "app",
  "dev",
  "gift-animations-preview",
  "layout.jsx"
);
const middlewarePath = join(__dirname, "..", "middleware.js");
const catalogPath = join(__dirname, "..", "lib", "giftAnimationsPreviewCatalog.js");

const PREVIEW_COMPONENTS = [
  { file: "EiffelTowerGiftPreview.jsx", durationMs: 3000 },
  { file: "ExplorerShipGiftPreview.jsx", durationMs: 4000 },
  { file: "ConnectedPlanetGiftPreview.jsx", durationMs: 5000 },
];

// ── Route protection ────────────────────────────────────────────────────────

test("/dev/gift-animations-preview is never a public route", () => {
  assert.equal(isPublicRoute("/dev/gift-animations-preview"), false);
});

test("/dev/* requires an authenticated session like other protected routes", () => {
  assert.equal(isProtectedRoutePath("/dev/gift-animations-preview"), true);
  assert.equal(
    shouldRedirectUnauthenticatedToLogin({
      pathname: "/dev/gift-animations-preview",
      hasBackendSession: false,
      hasNextAuthSession: false,
    }),
    true
  );
  assert.equal(
    shouldRedirectUnauthenticatedToLogin({
      pathname: "/dev/gift-animations-preview",
      hasBackendSession: true,
      hasNextAuthSession: false,
    }),
    false
  );
});

test("middleware marks /dev paths as noindex, nofollow like /admin", async () => {
  const source = await readFile(middlewarePath, "utf8");
  assert.match(source, /isDevPreviewPath\s*=\s*request\.nextUrl\.pathname\.startsWith\("\/dev"\)/);
  assert.match(source, /isAdminPath \|\| isDevPreviewPath/);
});

test("the preview layout sets robots noindex metadata", async () => {
  const source = await readFile(layoutPath, "utf8");
  assert.match(source, /index:\s*false/);
  assert.match(source, /follow:\s*false/);
});

// ── Dev-only gating & safety ────────────────────────────────────────────────

test("the preview page is fully disabled outside non-production environments", async () => {
  const source = await readFile(pagePath, "utf8");
  assert.match(source, /process\.env\.NODE_ENV\s*!==\s*"production"/);
  assert.match(source, /DevPreviewDisabledNotice/);
});

test("the preview page and catalog never call purchase/send endpoints or Coins balances", async () => {
  const pageSource = await readFile(pagePath, "utf8");
  const catalogSource = await readFile(catalogPath, "utf8");
  const forbidden = /fetch\(|axios|coinsBalance|earningsCoins|\/api\/gifts|\/api\/coins/i;
  assert.doesNotMatch(pageSource, forbidden);
  assert.doesNotMatch(catalogSource, forbidden);
});

test("the preview catalog documents proposed (non-charging) coin values for all three gifts", async () => {
  // Read as source rather than importing: the file uses Next's "@/..."
  // path alias (resolved by the Next build, not by plain `node --test`).
  const source = await readFile(catalogPath, "utf8");

  assert.match(source, /id:\s*"eiffel-tower"[\s\S]*?proposedCoins:\s*300/);
  assert.match(source, /id:\s*"explorer-ship"[\s\S]*?proposedCoins:\s*800/);
  assert.match(source, /id:\s*"connected-planet"[\s\S]*?proposedCoins:\s*8000/);
  assert.equal((source.match(/id:\s*"(eiffel-tower|explorer-ship|connected-planet)"/g) || []).length, 3);
});

// ── Animation components ────────────────────────────────────────────────────

for (const { file, durationMs } of PREVIEW_COMPONENTS) {
  test(`${file} declares its target duration (${durationMs}ms) and cleans up its timers`, async () => {
    const source = await readFile(join(componentsDir, file), "utf8");

    assert.match(source, new RegExp(`${durationMs}`));
    // Timers must be captured and cleared on unmount — no dangling timeouts.
    assert.match(source, /timersRef\.current\s*=\s*\[/);
    assert.match(source, /timersRef\.current\.forEach\(clearTimeout\)/);
    // onComplete must actually be invoked so hosts can know the cycle ended.
    assert.match(source, /if \(onComplete\) onComplete\(\)/);
  });

  test(`${file} respects prefers-reduced-motion and never relies on a static emoji`, async () => {
    const source = await readFile(join(componentsDir, file), "utf8");
    assert.match(source, /prefers-reduced-motion:\s*reduce/);
    // These are hand-authored SVG/CSS scenes, not an emoji glyph standing in
    // for the requested scene.
    assert.match(source, /<svg/);
    assert.doesNotMatch(source, /viewBox="0 0 100 100"[^>]*>\s*<text/);
  });

  test(`${file} has a mobile-responsive breakpoint`, async () => {
    const source = await readFile(join(componentsDir, file), "utf8");
    assert.match(source, /@media \(max-width:\s*480px\)/);
  });

  test(`${file} does not call any network/purchase/Coins API`, async () => {
    const source = await readFile(join(componentsDir, file), "utf8");
    assert.doesNotMatch(source, /fetch\(|axios|coinsBalance|earningsCoins|\/api\//i);
  });
}
