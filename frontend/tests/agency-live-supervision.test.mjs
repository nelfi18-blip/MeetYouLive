import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = (p) => readFile(new URL("../" + p, import.meta.url), "utf8");

test("agency frontend only mounts live supervision for enabled agency owners", async () => {
  const page = await source("app/agency/page.jsx");
  assert.match(page, /agencyData\?\.agencyEnabled && <AgencyLiveSupervision/);
});

test("supervision uses the authorized scoped API and a real Live link", async () => {
  const component = await source("components/agency/AgencyLiveSupervision.jsx");
  const store = await source("lib/agencySupervisionStore.js");
  assert.match(store, /\/api\/agency\/supervision\/lives/);
  assert.match(store, /\/audience/);
  assert.match(store, /\/reports/);
  assert.match(component, /href=\{"\/live\/" \+ encodeURIComponent\(live.id\)\}/);
  assert.doesNotMatch(component, /\/api\/admin\/|\/api\/chats\/|localStorage\.setItem/);
});

test("reports visibly retain agency, stream, category and target role for staff", async () => {
  const admin = await source("app/admin/reports/page.jsx");
  assert.match(admin, /AgencyReportContext/);
  assert.match(admin, /agencyContext/);
  for (const field of ["liveId", "agencyId", "category", "observedRole"]) {
    assert.match(admin, new RegExp("context\\." + field));
  }
});

test("agency supervision and moderation labels are available in ES EN PT", async () => {
  const dictionaries = await Promise.all(["es","en","pt"].map(async lang =>
    JSON.parse(await source("messages/" + lang + ".json"))));
  const keys = (obj) => Object.entries(obj).flatMap(([key,val]) =>
    typeof val === "object" && val ? Object.keys(val).map(child => key + "." + child) : [key]).sort();
  for (const dict of dictionaries) {
    assert.deepEqual(keys(dict.agencySupervision),keys(dictionaries[0].agencySupervision));
    for (const field of ["title","moderationSource","moderationLive","moderationAgency","host","staffOnly"]) {
      assert.ok(dict.agencySupervision[field]);
    }
  }
});
