import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");
const pricingSource = await readSource("../components/PricingPageContent.jsx");

test("public prices use backend reference data without implying web checkout", async () => {
  assert.match(pricingSource, /fetch\(\x60\$\{API_URL\}\/api\/coins\/packages\x60\)/);
  assert.match(pricingSource, /pkg\.priceUsd/);
  assert.match(pricingSource, /pricing\.coinsPriceReference/);
  assert.match(pricingSource, /pricing\.coinsPackLabel/);
  assert.doesNotMatch(pricingSource, /\{pkg\.description/);
  assert.doesNotMatch(pricingSource, /\$4\.99|\$9\.99|\$19\.99/);
});

test("inactive VIP does not advertise unconfirmed bonus coins", () => {
  assert.match(pricingSource, /tier\.available && typeof tier\.bonusCoinsPerMonth === "number"/);
  assert.match(pricingSource, /tier\.available \? formatUsd\(tier\.priceUsd\) : null/);
  assert.match(pricingSource, /!tier\.available &&/);
});

test("only public pricing receives compact spacing, without modifying authenticated pages", async () => {
  const [wrapper, css] = await Promise.all([
    readSource("../components/MainContentWrapper.jsx"),
    readSource("../app/globals.css"),
  ]);
  assert.match(wrapper, /pathname === "\/pricing" && "main-content-pricing"/);
  assert.match(css, /main\.main-content\.main-content-pricing \{\s*padding-bottom: max\(1rem, env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /\.main-content-bottom-nav/);
  assert.match(pricingSource, /@media \(max-width: 600px\)/);
});

for (const language of ["es", "en", "pt"]) {
  test(`pricing in ${language} explains Google Play payments and does not advertise live Stripe or VIP`, async () => {
    const messages = JSON.parse(await readSource(`../messages/${language}.json`));
    const m = messages.pricing;
    for (const key of ["intro", "coinsPriceReference", "paymentsBody", "ctaBody"]) {
      assert.match(m[key], /Google Play/, `${language}: ${key}`);
      assert.match(m[key], /Android/, `${language}: ${key}`);
    }
    // It is truthful to mention Stripe only to explain that web charging is
    // unavailable or pending. A future pricing-only PR uses that wording.
    // Never allow wording that presents Stripe checkout as active.
    assert.doesNotMatch(
      m.paymentsBody,
      /pagos (?:se procesan|seguros)[^.!?]{0,80}Stripe|payments (?:are )?processed[^.!?]{0,80}Stripe|pagamentos (?:são )?processados[^.!?]{0,80}Stripe/i
    );
    if (/Stripe/i.test(m.paymentsBody)) {
      const pendingByLanguage = {
        es: /pendiente|no est[aá]n disponibles/i,
        en: /pending|not currently available/i,
        pt: /pendentes|n[aã]o [eé] poss[ií]vel/i,
      };
      assert.match(m.paymentsBody, pendingByLanguage[language], `${language}: web Stripe must be unavailable`);
    }
    assert.doesNotMatch(m.subtitle, /everything costs|cuesta todo|tudo custa/i);
    assert.match(m.coinsPackLabel, /\{count\}/);
    assert.match(m.coinsPriceReference, /USD/);
    assert.match(m.vipPausedNotice, /VIP/);
    assert.doesNotMatch(m.vipPausedNotice, /50|150|500/);
    assert.equal(typeof m.coinsPackLabel, "string");
    assert.equal(typeof m.coinsPriceReference, "string");
  });
}
