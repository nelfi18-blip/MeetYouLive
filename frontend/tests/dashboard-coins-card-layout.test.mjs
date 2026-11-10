import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = () => readFile(new URL("../app/dashboard/page.jsx", import.meta.url), "utf8");

test("mobile Coins card has a compact page-scoped grid on the real Next.js Link", async () => {
  const source = await page();
  assert.match(source, /<Link href="\/coins" className="coins-compact-card"/);
  assert.match(source, /\.dashboard > a\.coins-compact-card\s*\{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: 42px minmax\(0, 1fr\) 34px;/);
  assert.match(source, /<style jsx global>/);
  assert.match(source, /@media \(max-width: 480px\)[\s\S]*?\.dashboard > a\.coins-compact-card/);
  assert.match(source, /\.dashboard > a\.coins-compact-card \.coins-compact-arrow/);
});

test("Coins card displays the real user balance without a fabricated fallback amount", async () => {
  const source = await page();
  assert.match(source, /href="\/coins" className="coins-compact-card"[\s\S]*?dashboard\.coinsAvailable[\s\S]*?user\?\.coins \?\? 0/);
  assert.match(source, /fetch\(\`\$\{API_URL\}\/api\/user\/me\`/);
  assert.doesNotMatch(source, /fakeCoins|mockCoins|Math\.random\(\).*coins/i);
});
