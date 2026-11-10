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

test("Coins packages are compact and content clears the fixed bottom navigation", async () => {
  const page = await source("app/coins/page.jsx");
  assert.match(page, /\.coins-page \.packages-grid \.ppc-coin-stage/);
  assert.match(page, /\.coins-page \.packages-grid \.ppc \.gold-coin-wrap/);
  assert.match(page, /\.coins-page\s*\{\s*padding-bottom: calc\(116px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(page, /\.coins-page \.trust-card \.uses-grid/);
});

test("Coins keeps its full disclosures accessible behind a native disclosure control", async () => {
  const page = await source("app/coins/page.jsx");
  assert.match(page, /<details className="coins-legal-details">/);
  assert.match(page, /<summary className="coins-legal-summary">/);
  assert.match(page, /coins\.balanceLimitParagraphEnd/);
  assert.match(page, /coins\.notList/);
  assert.match(page, /coins\.creatorEarningsParagraph2End/);
  assert.match(page, /MAX_COINS_BALANCE\.toLocaleString/);
  assert.doesNotMatch(page, /style=\{\{\s*display:\s*"none"/);
});

test("Coin history localizes only legacy daily reward reason without changing ledger values", async () => {
  const page = await source("app/coins/page.jsx");
  assert.match(page, /item\.type === "daily_reward"/);
  assert.match(page, /reason: t\("coins\.dailyRewardDayReason"\)\.replace\("\{day\}", match\[1\]\)/);
  assert.match(page, /<TransactionListCard[\s\S]*?items=\{transactions\.map/);
  assert.match(page, /\.\.\.item, reason:/);
  for (const lang of ["es", "en", "pt"]) {
    const messages = JSON.parse(await source(`messages/${lang}.json`));
    assert.match(messages.coins.legalBrief, /\{limit\}/);
    assert.match(messages.coins.dailyRewardDayReason, /\{day\}/);
    assert.ok(messages.coins.legalDetailsTitle.length > 10);
    assert.ok(messages.coins.creatorEarningsTerm.length > 3);
    if (lang === "es") {
      assert.equal(messages.coins.creatorEarningsTitle, "Ganancias de creadores");
      assert.doesNotMatch(messages.coins.creatorEarningsParagraph1Middle, /creators|payouts/i);
    }
  }
});

test("Marketing badges do not invent purchase popularity or monetary cash value", async () => {
  const page = await source("app/coins/page.jsx");
  assert.match(page, /perCoin: paymentProvider === "stripe" \? pkg\.perCoin : null/);
  assert.match(page, /perCoin: "\$0\.0400"/);
  assert.match(page, /perCoin: "\$0\.0286"/);
  for (const lang of ["es", "en", "pt"]) {
    const d = JSON.parse(await source(`messages/${lang}.json`));
    assert.doesNotMatch(d.coins.packages["250"].badge, /más popular|most popular|mais popular/i);
    assert.doesNotMatch(d.coins.valueEyebrow, /valor real|real value/i);
  }
});
