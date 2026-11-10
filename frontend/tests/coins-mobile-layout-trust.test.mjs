import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Coins hero is compact and Wallet/Sparks labels never rely on scoped styles of Next.js links", async () => {
  const page = await source("app/coins/page.jsx");
  assert.match(page, /<style jsx global>/);
  assert.match(page, /\.coins-page \.hero-balance-grid > \.hero-balance-pill\s*\{[\s\S]*?display: grid;/);
  assert.match(page, /\.coins-page \.hero-balance-grid > \.hero-balance-pill \.hero-pill-label/);
  assert.match(page, /grid-template-columns: 42px minmax\(0, 1fr\);/);
  assert.match(page, /@media \(max-width: 640px\)/);
  assert.match(page, /\.coins-page \.hero-cta-row > a\.btn/);
  assert.match(page, /min-height: 48px/);
  assert.match(page, /prefers-reduced-motion: reduce/);
});

test("Coins screen avoids duplicate Wallet links and rotating sales banner", async () => {
  const page = await source("app/coins/page.jsx");
  assert.doesNotMatch(page, /<UrgencyBanner/);
  assert.doesNotMatch(page, /coins\.fullWallet/);
  assert.match(page, /<Link href="\/wallet" className="btn btn-secondary btn-lg">/);
  assert.match(page, /href="#packages"/);
});

test("Only real balance is displayed, preserving existing Apple/Google/Stripe purchase handling", async () => {
  const page = await source("app/coins/page.jsx");
  assert.match(page, /balance \?\? "—"/);
  assert.match(page, /sparks !== null/);
  assert.match(page, /api\/user\/coins/);
  assert.match(page, /isAndroidNativeBillingAvailable\(\)/);
  assert.match(page, /isIOSNativeBillingAvailable\(\)/);
  assert.match(page, /api\/payments\/coins/);
});

test("Coin purchase introduction is concise and translated", async () => {
  for (const lang of ["es", "en", "pt"]) {
    const data = JSON.parse(await source(`messages/${lang}.json`));
    assert.ok(data.coins.heroTitle.length < 45);
    assert.ok(data.coins.heroSubtitle.length < 90);
  }
});
