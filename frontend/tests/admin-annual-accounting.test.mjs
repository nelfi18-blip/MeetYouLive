import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getAnnualCoverage,
  getAnnualCurrencyEntries,
  getAnnualMonthRows,
  getAnnualSourceStatus,
  getAnnualYearOptions,
} from "../lib/adminAnnualAccounting.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pagePath = join(__dirname, "../app/admin/accounting/annual/page.jsx");
const shellPath = join(__dirname, "../app/admin/AdminShell.jsx");

test("annual year selector covers supported years through the current year", () => {
  assert.deepEqual(getAnnualYearOptions(2026), [2026, 2025, 2024, 2023, 2022, 2021, 2020]);
});

test("annual source status preserves complete, partial and unavailable states", () => {
  assert.equal(getAnnualSourceStatus({ status: "complete" }), "complete");
  assert.equal(getAnnualSourceStatus({ status: "partial" }), "partial");
  assert.equal(getAnnualSourceStatus({ status: "unavailable" }), "unavailable");
  assert.equal(getAnnualSourceStatus(null), "unavailable");
});

test("coverage month lists remain absent when unknown and filter invalid month numbers", () => {
  assert.deepEqual(
    getAnnualCoverage({
      status: "partial",
      coverage: { completeMonths: [1, 12, 13, null], partialMonths: [2], missingMonths: [3] },
    }),
    { status: "partial", completeMonths: [1, 12], partialMonths: [2], missingMonths: [3] }
  );
  assert.deepEqual(getAnnualCoverage({ status: "partial" }), {
    status: "partial",
    completeMonths: null,
    partialMonths: null,
    missingMonths: null,
  });
});

test("annual currencies stay separate and unavailable sources expose no totals", () => {
  const source = {
    status: "partial",
    byCurrency: { usd: { grossMinorUnits: 1000 }, eur: { grossMinorUnits: 900 } },
  };
  assert.deepEqual(getAnnualCurrencyEntries(source), [
    ["usd", { grossMinorUnits: 1000 }],
    ["eur", { grossMinorUnits: 900 }],
  ]);
  assert.deepEqual(getAnnualCurrencyEntries({ status: "unavailable", byCurrency: { usd: {} } }), []);
});

test("all calendar months render; missing and partial months are explicit with warnings preserved", () => {
  const rows = getAnnualMonthRows([
    { month: 1, status: "complete" },
    { month: 2, status: "partial", warnings: ["Stripe scan truncated."] },
    { month: 13, status: "complete" },
  ]);
  assert.equal(rows.length, 12);
  assert.equal(rows[0].status, "complete");
  assert.equal(rows[1].status, "partial");
  assert.deepEqual(rows[1].warnings, ["Stripe scan truncated."]);
  assert.equal(rows[11].status, "unavailable");
});

test("annual page uses only the annual endpoint and retains admin 401/403 handling", async () => {
  const page = await readFile(pagePath, "utf8");
  assert.match(page, /\/api\/admin\/reports\/financial\/annual\?year=\$\{year\}/);
  assert.doesNotMatch(page, /\/api\/admin\/reports\/financial\/monthly/);
  assert.match(page, /response\.status === 401/);
  assert.match(page, /clearAdminToken\(\)/);
  assert.match(page, /router\.replace\("\/admin\/login"\)/);
  assert.match(page, /response\.status === 403/);
  assert.match(page, /setForbidden\(true\)/);
});

test("annual render separates Stripe, Coins, payouts, snapshots, and per-month warnings", async () => {
  const page = await readFile(pagePath, "utf8");
  assert.match(page, /annualTotals\?\.stripeCharges/);
  assert.match(page, /title=\{t\("adminAccounting\.summaryCards\.stripeFees"\)\}/);
  assert.match(page, /fieldsToShow=\{STRIPE_FEE_FIELDS\}/);
  assert.match(page, /annualTotals\?\.coinsReconciliation/);
  assert.match(page, /annualTotals\?\.creatorPayoutsPaidInPeriod/);
  assert.match(page, /creatorPaymentsSnapshot/);
  assert.match(page, /withdrawalRequestsPendingAsOfNow/);
  assert.match(page, /withdrawalRequestsPaidLifetimeIncomplete/);
  assert.match(page, /month\.warnings\.map/);
  assert.match(page, /value \?\? "—"/);
  assert.match(page, /coins\?\.reconciled !== true/);
  assert.match(page, /coins\?\.reconciledNote/);
});

test("monthly/annual navigation and annual shell entry are restricted to administrators", async () => {
  const [page, shell] = await Promise.all([
    readFile(pagePath, "utf8"),
    readFile(shellPath, "utf8"),
  ]);
  assert.match(page, /href="\/admin\/accounting"/);
  assert.match(shell, /\{ href: "\/admin\/accounting\/annual",[^}]*roles:\s*\["admin"\]/);
  assert.match(shell, /\{ href: "\/admin\/accounting",[^}]*roles:\s*\["admin"\]/);
});
