import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../components/LandingPageContent.jsx", import.meta.url), "utf8");

test("landing never advertises restricted Stripe checkout as active", () => {
  assert.match(source, /landing\.advantages\.androidBilling/);
  assert.match(source, /landing\.trust\.googlePlayAndroid/);
  assert.doesNotMatch(source, /landing\.advantages\.stripePayments|landing\.trust\.stripe/);
});

test("landing does not show a fabricated currently-live indicator", () => {
  assert.match(source, /📡 \{t\("landing\.heroCard\.livePill"\)\}/);
  assert.doesNotMatch(source, /● \{t\("landing\.heroCard\.livePill"\)\}/);
});

for (const language of ["es", "en", "pt"]) {
  test(`landing in ${language} accurately scopes Coins billing to Android Google Play`, async () => {
    const messages = JSON.parse(
      await readFile(new URL(`../messages/${language}.json`, import.meta.url), "utf8")
    );
    const advantages = messages.landing.advantages;
    const trust = messages.landing.trust;
    assert.match(advantages.androidBilling, /Google Play/);
    assert.match(trust.googlePlayAndroid, /Google Play/);
    assert.equal(advantages.stripePayments, undefined);
    assert.equal(trust.stripe, undefined);
    assert.match(advantages.androidBilling, /Android/);
    assert.match(trust.googlePlayAndroid, /Android/);
    assert.notEqual(messages.landing.heroCard.livePill, { es: "En vivo", en: "Live", pt: "Ao vivo" }[language]);
  });
}
