import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("admin analytics has page-scoped global styling that reaches nested components", async () => {
  const page = await source("app/admin/analytics/page.jsx");
  assert.match(page, /className="admin-analytics-page"/);
  assert.match(page, /<style jsx global>/);
  assert.match(page, /\.admin-analytics-page \.metric-card \{/);
  assert.match(page, /\.admin-analytics-page \.tiny-row \{/);
  assert.match(page, /\.admin-analytics-page \.ranking-row \{/);
  assert.match(page, /\.admin-analytics-page \.funnel-step \{/);
  assert.match(page, /@media \(max-width: 640px\)/);
  assert.doesNotMatch(page, /<style jsx>\{/);
});

test("funnel shows honest independent event counts rather than false conversion/dropoff", async () => {
  const page = await source("app/admin/analytics/page.jsx");
  assert.match(page, /funnel\.map\(\(step\) =>/);
  assert.match(page, /<span>\{fmt\(step\.count\)\}<\/span>/);
  assert.match(page, /labels\.funnelNote/);
  assert.doesNotMatch(page, /index === 0 \? "100%"/);
  assert.doesNotMatch(page, /step\.dropoffPercent/);
  assert.doesNotMatch(page, /step\.conversionFromPrevious/);
});

test("analytics discloses period differences and avoids 7 zero acquisition cards", async () => {
  const page = await source("app/admin/analytics/page.jsx");
  assert.match(page, /labels\.snapshotNote/);
  assert.match(page, /labels\.acquisitionNote/);
  assert.match(page, /Number\(acquisition\.totalVisitors \|\| 0\) === 0/);
  assert.match(page, /labels\.zeroTrafficNote/);
  assert.match(page, /trend\.some\(\(item\) =>/);
});

test("new analytics explanations exist in ES EN and PT with identical keys", async () => {
  const required = ["snapshotNote", "acquisitionNote", "funnelNote", "zeroTrafficNote"];
  for (const lang of ["es", "en", "pt"]) {
    const messages = JSON.parse(await source(`messages/${lang}.json`));
    for (const key of required) {
      assert.equal(typeof messages.adminAnalytics[key], "string", `${lang}.${key}`);
      assert.ok(messages.adminAnalytics[key].length > 30, `${lang}.${key} missing text`);
    }
  }
});
