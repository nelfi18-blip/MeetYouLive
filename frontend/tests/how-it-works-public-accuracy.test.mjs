import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const langs = ["es", "en", "pt"];

for (const lang of langs) {
  test(`How It Works in ${lang} does not advertise inactive Stripe payments or VIP benefits`, async () => {
    const messages = JSON.parse(await read(`../messages/${lang}.json`));
    const doc = messages.legal.policies.howItWorks;
    assert.equal(doc.sections.length, 5);
    const copy = [doc.description, ...doc.sections.flatMap((section) => section.body)].join(" ");
    assert.match(copy, /Google Play/);
    assert.match(copy, /Android/);
    assert.match(copy, /VIP/);
    assert.doesNotMatch(copy, /Stripe/i);
    assert.doesNotMatch(copy, /memberships enable|membresías.*habilitan|assinaturas.*habilitam/i);
    assert.doesNotMatch(copy, /17 de julio de 2026|July 17, 2026|17 de julho de 2026/);
    assert.match(doc.lastUpdated, /2026/);
    assert.match(doc.sections[4].body[0], /Google Play/);
  });
}

test("only the How It Works informational route uses the compact public-page spacing", async () => {
  const [legal, wrapper, css] = await Promise.all([
    read("../components/LegalPage.jsx"),
    read("../components/MainContentWrapper.jsx"),
    read("../app/globals.css"),
  ]);
  assert.match(legal, /policyKey === "howItWorks" \? "legal-page legal-page-how-it-works" : "legal-page"/);
  assert.match(legal, /\.legal-page-how-it-works \{ min-height: auto; padding-bottom: 0; \}/);
  assert.match(wrapper, /pathname === "\/how-it-works" && "main-content-how-it-works"/);
  assert.match(css, /main\.main-content\.main-content-how-it-works \{\s*padding-bottom: max\(1rem, env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /\.main-content-bottom-nav/);
});
