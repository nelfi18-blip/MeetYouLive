import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Stripe-compliance PR: explicit sexual-content policy language, a public
// /pricing page, and a minimal pre-Live rules confirmation on /live/start.

const __dirname = dirname(fileURLToPath(import.meta.url));
const readSource = (path) => readFile(join(__dirname, path), "utf8");
const loadMessages = (lang) => readSource(`../messages/${lang}.json`).then(JSON.parse);

const SUPPORTED_LANGS = ["en", "es", "pt"];

test("AUP contains an explicit prohibition of sexually explicit content/communications even with adult consent", async () => {
  for (const lang of SUPPORTED_LANGS) {
    const messages = await loadMessages(lang);
    const aup = messages.legal.policies.acceptableUse;
    const text = aup.sections.flatMap((section) => section.body).join(" ");
    assert.match(text, /consent/i, `${lang}: must mention consent explicitly`);
    assert.match(text, /sexual/i, `${lang}: must mention sexual content/communications`);
    // Every language must state, in its own words, that adult consent does
    // not legitimize sexually explicit content or communications.
    const consentDoesNotPermit = {
      en: "consent between adults does not make sexually explicit content",
      es: "el consentimiento entre adultos no hace permisible el contenido sexualmente explícito",
      pt: "o consentimento entre adultos não torna permissível o conteúdo sexualmente explícito",
    }[lang];
    assert.ok(
      text.toLowerCase().includes(consentDoesNotPermit.toLowerCase()),
      `${lang}: AUP must explicitly state consent does not permit sexually explicit content`
    );
  }
});

test("Community Guidelines do not contradict the AUP's sexual-content prohibition", async () => {
  for (const lang of SUPPORTED_LANGS) {
    const messages = await loadMessages(lang);
    const guidelines = messages.legal.policies.communityGuidelines;
    const text = guidelines.sections.flatMap((section) => section.body).join(" ");
    assert.match(text, /sexual/i, `${lang}: community guidelines must mention sexual content`);
    assert.doesNotMatch(text, /legal pornography|pornograf[ií]a legal|pornografia legal/i, `${lang}`);
  }
});

test("/pricing is wired into PUBLIC_ROUTE_PATHS using the existing architecture", async () => {
  const source = await readSource("../lib/publicAccess.js");
  assert.match(source, /"\/pricing"/);
});

test("/pricing page exists, fetches real prices from existing public backend endpoints and does not hardcode monetary values", async () => {
  await assert.doesNotReject(readSource("../app/pricing/page.jsx"));
  const content = await readSource("../components/PricingPageContent.jsx");
  // Must reuse the existing public (no-auth) backend endpoints as the single
  // source of truth for prices instead of inventing or duplicating numbers.
  assert.match(content, /\/api\/coins\/packages/);
  assert.match(content, /\/api\/subscriptions\/tiers/);
  assert.doesNotMatch(content, /4\.99|9\.99|19\.99/);
  assert.match(content, /pkg\.priceUsd/);
  assert.match(content, /tier\.priceUsd/);
});

test("/pricing links to Acceptable Use, Terms and Payments & Refunds via the existing LegalLinks component", async () => {
  const content = await readSource("../components/PricingPageContent.jsx");
  assert.match(content, /<LegalLinks/);
  const legalPolicies = await readSource("../lib/legalPolicies.js");
  assert.match(legalPolicies, /acceptableUse.*\/acceptable-use/s);
  assert.match(legalPolicies, /terms.*\/terms/s);
});

test("pricing translation keys keep EN/ES/PT parity", async () => {
  const catalogs = {};
  for (const lang of SUPPORTED_LANGS) {
    catalogs[lang] = (await loadMessages(lang)).pricing;
  }
  const keys = Object.keys(catalogs.en);
  assert.ok(keys.length > 0);
  for (const lang of ["es", "pt"]) {
    assert.deepEqual(Object.keys(catalogs[lang]).sort(), keys.sort(), lang);
  }
});

test("/live/start requires explicit rules acceptance before submitting, without touching the real start-Live call", async () => {
  const source = await readSource("../app/live/start/page.jsx");

  assert.match(source, /rulesAccepted/);
  assert.match(source, /t\("liveStart\.rulesAcceptanceRequired"\)/);
  assert.match(source, /disabled=\{loading \|\| !rulesAccepted\}/);
  assert.match(source, /type="checkbox"/);

  // The real Live-start network call and payload must remain unchanged.
  assert.match(source, /fetch\(`\$\{API_URL\}\/api\/lives\/start`, \{/);
  assert.match(source, /method: "POST"/);
  assert.match(source, /router\.push\(`\/live\/\$\{data\._id\}`\)/);
});

test("/live/start links to Acceptable Use Policy and Community Guidelines", async () => {
  const source = await readSource("../app/live/start/page.jsx");
  assert.match(source, /href="\/acceptable-use"/);
  assert.match(source, /href="\/community-guidelines"/);
});

test("live-start pre-Live rule copy exists in EN/ES/PT and does not claim automatic AI monitoring", async () => {
  for (const lang of SUPPORTED_LANGS) {
    const messages = await loadMessages(lang);
    const liveStart = messages.liveStart;
    for (const key of [
      "rulesTitle",
      "ruleNoNudity",
      "ruleNoSexualConduct",
      "ruleNoHateViolence",
      "ruleNoIllegalActivity",
      "ruleModerationNotice",
      "rulesAcceptCheckbox",
      "rulesAcceptanceRequired",
    ]) {
      assert.equal(typeof liveStart[key], "string", `${lang}.liveStart.${key}`);
      assert.ok(liveStart[key].length > 0, `${lang}.liveStart.${key}`);
    }
    const allText = Object.values(liveStart).join(" ").toLowerCase();
    assert.doesNotMatch(allText, /ai[ -]monitored|monitorizad[oa] por ia|monitorado por ia/i, lang);
  }
});
