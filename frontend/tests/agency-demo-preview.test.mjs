import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AGENCY_DEMO_PATH, AGENCY_DEMO_BRANCH, isAgencyDemoPreviewEnabled } from "../lib/agencyDemoPreviewAccess.js";
import { isProtectedRoutePath, isPublicRoute } from "../lib/publicAccess.js";

const source = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("passwordless demo can only be enabled on one exact preview branch", () => {
  assert.equal(AGENCY_DEMO_PATH, "/dev/agency-demo");
  assert.equal(isAgencyDemoPreviewEnabled({ environment: "preview", branch: AGENCY_DEMO_BRANCH }), true);
  for (const environment of ["production", "development", undefined, "", "prod"]) {
    assert.equal(isAgencyDemoPreviewEnabled({ environment, branch: AGENCY_DEMO_BRANCH }), false);
  }
  assert.equal(isAgencyDemoPreviewEnabled({ environment: "preview", branch: "main" }), false);
  assert.equal(isAgencyDemoPreviewEnabled({ environment: "preview", branch: "feat/vcr-horizon-3d-world" }), false);
  assert.equal(isAgencyDemoPreviewEnabled({ environment: "preview", branch: "" }), false);
});

test("normal protected pages stay protected and public access only bypassed in middleware on exact gated path", async () => {
  assert.equal(isPublicRoute(AGENCY_DEMO_PATH), false);
  assert.equal(isProtectedRoutePath(AGENCY_DEMO_PATH), true);
  for (const path of ["/dev/gift-animations-preview", "/creator", "/agency", "/chats", "/coins"]) {
    assert.equal(isProtectedRoutePath(path), true, path);
  }
  const middleware = await source("middleware.js");
  assert.match(middleware, /pathname === AGENCY_DEMO_PATH && isAgencyDemoPreviewEnabled\(\)/);
  assert.match(middleware, /if \(isPublicRoute\(pathname\)\)/);
  assert.match(middleware, /if \(!backendSession && !nextAuthSession && isProtectedRoute\)/);
});

test("demo page is gated server-side and cannot enter production or fetch private data", async () => {
  const page = await source("app/dev/agency-demo/page.jsx");
  const demo = await source("app/dev/agency-demo/AgencyDemoClient.jsx");
  assert.match(page, /if \(!isAgencyDemoPreviewEnabled\(\)\) \{/);
  assert.match(page, /notFound\(\)/);
  assert.match(page, /dynamic = "force-dynamic"/);
  assert.match(demo, /CreatorNetworkCompact/);
  assert.match(demo, /setRole\(next\)/);
  assert.match(demo, /role === "user"/);
  assert.match(demo, /role === "creator"|role, setRole/);
  assert.match(demo, /onRequestAgency=\{\(\) => setRequestStatus\("pending"\)\}/);
  assert.doesNotMatch(demo, /\bfetch\s*\(/);
  assert.doesNotMatch(demo, /\b(?:setToken|signIn|localStorage|sessionStorage)\s*\(/);
  assert.doesNotMatch(demo, /api\/agency\/request/);
  assert.doesNotMatch(demo, /(?:onClick|href)=\{?["']\/agency/);
});

test("demo opens in Spanish and offers voluntary language switching", async () => {
  const demo = await source("app/dev/agency-demo/AgencyDemoClient.jsx");
  assert.match(demo, /const \[demoLang, setDemoLang\] = useState\("es"\)/);
  assert.match(demo, /if \(lang !== demoLang\) setLang\(demoLang\)/);
  assert.match(demo, /aria-pressed=\{demoLang === code\}/);
  assert.match(demo, /Español/);
  assert.match(demo, /English/);
  assert.match(demo, /Português/);
});

test("application button is visibly disabled when the agency name is missing or eligibility is false", async () => {
  const component = await source("components/creator/CreatorNetworkCompact.jsx");
  assert.match(component, /requestedName\.trim\(\)\.length < 3/);
  assert.match(component, /!agencyEligibility\?\.eligible/);
  assert.match(component, /not-allowed/);
  assert.match(component, /#342d4b/);
});

test("only synthetic eligible creator can submit demo form and not qualified demo shows missing prerequisites", async () => {
  const demo = await source("app/dev/agency-demo/AgencyDemoClient.jsx");
  const form = await source("components/creator/CreatorNetworkCompact.jsx");
  assert.match(demo, /eligible: true/);
  assert.match(demo, /eligible: false/);
  assert.match(demo, /daysAsCreator: 12/);
  assert.match(demo, /completedLives: 1/);
  assert.match(form, /!agencyEligibility\?\.eligible/);
  assert.match(form, /acceptedSupervision/);
});
