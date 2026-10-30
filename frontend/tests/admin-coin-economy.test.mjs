import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const accountingPagePath = join(__dirname, "../app/admin/accounting/page.jsx");
const messagesDir = join(__dirname, "../messages");

async function loadMessages(lang) {
  const raw = await readFile(join(messagesDir, `${lang}.json`), "utf-8");
  return JSON.parse(raw);
}

// ---------------------------------------------------------------------------
// Coin Economy Control tab — reuses the existing /admin/accounting page and
// its authorization mechanisms (no new admin page/route).
// ---------------------------------------------------------------------------

test("accounting page adds a Coin economy tab without removing existing tabs", async () => {
  const source = await readFile(accountingPagePath, "utf8");
  assert.match(
    source,
    /const TABS = \["summary", "stripe", "coins", "creators", "coinEconomy", "warnings"\];/
  );
});

test("Coin Economy Control is fetched from its own read-only endpoint, independent of year/month", async () => {
  const source = await readFile(accountingPagePath, "utf8");
  assert.match(source, /\/api\/admin\/reports\/financial\/coin-economy/);
  assert.match(source, /loadCoinEconomy/);
  // The endpoint call itself never interpolates year/month — it is a
  // point-in-time diagnostic, not a monthly report.
  const call = source.match(/`\$\{API_URL\}\/api\/admin\/reports\/financial\/coin-economy`/);
  assert.ok(call, "coin-economy fetch must not be parameterized by year/month");
});

test("Coin Economy Control tab reuses the same 401/403 handling as the monthly report", async () => {
  const source = await readFile(accountingPagePath, "utf8");
  const section = source.slice(source.indexOf("loadCoinEconomy = useCallback"));
  assert.match(section, /res\.status === 401/);
  assert.match(section, /clearAdminToken\(\)/);
  assert.match(section, /res\.status === 403/);
  assert.match(section, /setCoinEconomyForbidden\(true\)/);
});

test("Coin Economy tab never sums Payout and WithdrawalRequest obligations into one figure", async () => {
  const source = await readFile(accountingPagePath, "utf8");
  const tabStart = source.indexOf('activeTab === "coinEconomy"');
  const tabEnd = source.indexOf('activeTab === "warnings"');
  const tabSource = source.slice(tabStart, tabEnd);
  assert.match(tabSource, /withdrawalObligations\.payouts/);
  assert.match(tabSource, /withdrawalObligations\.withdrawalRequests/);
  assert.match(tabSource, /notes\.noSumming/);
});

test("Coin Economy tab renders explicit data-gap notices from the backend's dataGaps array", async () => {
  const source = await readFile(accountingPagePath, "utf8");
  assert.match(source, /coinEconomy\.dataGaps/);
  assert.match(source, /coinEconomy\.dataGapLabels/);
});

test("Coin Economy tab never fabricates a figure for an unavailable section (uses Amount/— guarded by status)", async () => {
  const source = await readFile(accountingPagePath, "utf8");
  const tabStart = source.indexOf('activeTab === "coinEconomy"');
  const tabEnd = source.indexOf('activeTab === "warnings"');
  const tabSource = source.slice(tabStart, tabEnd);
  assert.match(tabSource, /balanceStatus === "unavailable"/);
  assert.match(tabSource, /purchaseStatus === "unavailable"/);
  assert.match(tabSource, /adjustmentsStatus === "unavailable"/);
});

test("adminAccounting.coinEconomy i18n keys are present and structurally identical across es/en/pt", async () => {
  const [es, en, pt] = await Promise.all([loadMessages("es"), loadMessages("en"), loadMessages("pt")]);
  for (const [lang, messages] of [
    ["es", es],
    ["en", en],
    ["pt", pt],
  ]) {
    assert.ok(messages.adminAccounting?.coinEconomy, `${lang}.json missing adminAccounting.coinEconomy`);
    assert.ok(messages.adminAccounting.tabs?.coinEconomy, `${lang}.json missing adminAccounting.tabs.coinEconomy`);
  }

  function flatten(obj, prefix = "") {
    const out = new Set();
    for (const [key, value] of Object.entries(obj)) {
      const full = prefix ? `${prefix}.${key}` : key;
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        for (const nested of flatten(value, full)) out.add(nested);
      } else {
        out.add(full);
      }
    }
    return out;
  }

  const esKeys = flatten(es.adminAccounting.coinEconomy);
  const enKeys = flatten(en.adminAccounting.coinEconomy);
  const ptKeys = flatten(pt.adminAccounting.coinEconomy);

  assert.deepEqual([...esKeys].sort(), [...enKeys].sort());
  assert.deepEqual([...esKeys].sort(), [...ptKeys].sort());
});
