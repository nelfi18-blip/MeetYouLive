import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("public pricing displays catalog USD values as references, not Google Play checkout prices", async () => {
  const page = await source("components/PricingPageContent.jsx");
  assert.match(page, /fetch\(\x60\$\{API_URL\}\/api\/coins\/packages\x60\)/);
  assert.match(page, /formatUsd\(pkg\.priceUsd\)/);
  assert.match(page, /pricing\.coinsPriceNote/);
  assert.match(page, /pricing\.coinsPriceReference/);
  assert.doesNotMatch(page, /pkg\.description/);
  assert.doesNotMatch(page, /<h3>\{pkg\.label\}<\/h3>/);
  assert.match(page, /pricing\.coinsPackLabel/);
});

test("public pricing copy never claims Stripe web checkout is enabled or VIP is purchasable", async () => {
  const locales = ["es", "en", "pt"];
  for (const lang of locales) {
    const messages = JSON.parse(await source("messages/" + lang + ".json"));
    const t = messages.pricing;
    for (const key of ["coinsPriceNote", "coinsPriceReference", "paymentsBody", "intro", "ctaBody"]) {
      assert.match(t[key], /Android|Google Play/, lang + " " + key);
    }
    assert.match(t.paymentsBody, /Stripe/);
    assert.match(t.paymentsBody, /Google Play/);
    assert.match(t.paymentsBody, /no est[aá]n disponibles|not currently available|n[aã]o [eé] poss[ií]vel/i);
    assert.doesNotMatch(t.paymentsBody, /Los pagos se procesan de forma segura a través de Stripe|Payments are processed securely through Stripe|Os pagamentos são processados com segurança pelo Stripe/i);
    assert.match(t.coinsPriceNote, /USD/);
    assert.match(t.coinsPackLabel, /\{count\}/);
    assert.match(t.vipPausedNotice, /VIP|VIP|VIP/);
  }
});

test("pricing mobile footer fix is scoped to public pricing and preserves BottomNav rules", async () => {
  const [globals, page, routes] = await Promise.all([
    source("app/globals.css"),
    source("components/PricingPageContent.jsx"),
    source("lib/bottomNavRoutes.js"),
  ]);
  assert.match(globals, /main\.main-content:has\(> \.pricing-page\)\s*\{\s*padding-bottom: max\(1rem, env\(safe-area-inset-bottom\)\)/);
  assert.match(globals, /--bottom-spacing-mobile: 180px/);
  assert.match(page, /\.pricing-page \{ padding: 1\.25rem 0\.5rem 1rem; gap: 1\.4rem; \}/);
  assert.match(routes, /"\/coins"/);
  assert.doesNotMatch(routes, /"\/pricing"/);
});

test("canonical backend pack definitions stay unchanged and display reference USD amounts", async () => {
  const coinsController = await source("../backend/src/controllers/coins.controller.js").catch(() => "");
  // Full backend CI separately protects purchase amounts and product mappings;
  // this frontend PR only changes public words and presentation.
  if (coinsController) {
    assert.match(coinsController, /googlePlayProductId: "coins_pack_100"/);
    assert.match(coinsController, /googlePlayProductId: "coins_pack_250"/);
    assert.match(coinsController, /googlePlayProductId: "coins_pack_700"/);
  }
});
