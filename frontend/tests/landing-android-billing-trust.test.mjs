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

for (const language of ["es", "en", "pt"]) {
  test(`landing in ${language} never promises a one-minute registration or universal web payments`, async () => {
    const messages = JSON.parse(
      await readFile(new URL(`../messages/${language}.json`, import.meta.url), "utf8")
    );
    const landing = messages.landing;
    for (const text of [
      landing.hero.description,
      landing.heroCard.description,
      landing.steps.step3.description,
      landing.operator.description,
    ]) {
      assert.match(text, /Android/);
      assert.match(text, /Google Play/);
      assert.doesNotMatch(text, /Stripe|secure payments|pagos seguros|pagamentos seguros/i);
    }
    const combined = [
      landing.hero.description,
      landing.cta.note.oneMinute,
    ].join(" ");
    assert.doesNotMatch(combined, /menos de un minuto|less than a minute|menos de um minuto|one minute|un minuto|um minuto/i);
    assert.ok(landing.cta.note.oneMinute.length > 12);
  });
}

test("landing language picker is accessible and persists supported user choices", () => {
  assert.match(source, /const \{ t, lang, setLang \} = useLanguage\(\)/);
  assert.match(source, /role="group" aria-label="Idioma \/ Language"/);
  assert.match(source, /aria-pressed=\{lang === code\}/);
  assert.match(source, /onClick=\{\(\) => setLang\(code\)\}/);
  for (const language of ["es", "en", "pt"]) {
    assert.match(source, new RegExp('code: "' + language + '"'));
  }
});

test("landing on small phones uses a compact two-column feature grid", () => {
  const mobile = source.split("@media (max-width: 560px) {")[1];
  assert.ok(mobile, "mobile breakpoint must exist");
  assert.match(mobile, /\.stats-grid \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(mobile, /\.stats-grid > span:last-child \{\s*grid-column: 1 \/ -1/);
});

test("only the public homepage drops the reserved bottom navigation padding", async () => {
  const [wrapper, css] = await Promise.all([
    readFile(new URL("../components/MainContentWrapper.jsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(wrapper, /pathname === "\/" && "main-content-landing"/);
  assert.match(css, /main\.main-content\.main-content-landing \{\s*padding-bottom: max\(1rem, env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /--bottom-spacing-mobile: 180px/);
  assert.match(css, /\.main-content-bottom-nav \{/);
});

test("landing displays a localized adults-only notice next to signup", async () => {
  assert.match(source, /t\("landing\.hero\.adultsOnly"\)/);
  assert.match(source, /className="landing-age-note"/);
  for (const language of ["es", "en", "pt"]) {
    const messages = JSON.parse(
      await readFile(new URL(`../messages/${language}.json`, import.meta.url), "utf8")
    );
    assert.match(messages.landing.hero.adultsOnly, /18/);
  }
});
