import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LANG,
  detectLanguageFromAcceptLanguage,
  detectLanguageFromNavigator,
  normalizeLanguage,
  resolveInitialLanguage,
} from "../lib/language.js";

test("detects supported browser languages", () => {
  assert.equal(detectLanguageFromNavigator({ language: "es-ES" }), "es");
  assert.equal(detectLanguageFromNavigator({ language: "en-US" }), "en");
  assert.equal(detectLanguageFromNavigator({ language: "pt-BR" }), "pt");
});

test("falls back to English for unsupported browser languages", () => {
  assert.equal(DEFAULT_LANG, "en");
  assert.equal(detectLanguageFromNavigator({ language: "fr-FR" }), "en");
  assert.equal(detectLanguageFromAcceptLanguage("de-DE,de;q=0.9"), "en");
});

test("uses Accept-Language order and quality values", () => {
  assert.equal(detectLanguageFromAcceptLanguage("fr-FR,pt-BR;q=0.9,en-US;q=0.8"), "pt");
  assert.equal(detectLanguageFromAcceptLanguage("en-US;q=0.7,es-ES;q=0.9"), "es");
});

test("keeps persisted manual preference before request language", () => {
  assert.equal(resolveInitialLanguage({ storedLanguage: "pt", acceptLanguage: "es-ES" }), "pt");
  assert.equal(resolveInitialLanguage({ storedLanguage: "en-US", acceptLanguage: "es-ES" }), "en");
  assert.equal(resolveInitialLanguage({ storedLanguage: "fr", acceptLanguage: "pt-BR" }), "pt");
  assert.equal(resolveInitialLanguage({ storedLanguage: "fr", acceptLanguage: "de-DE" }), DEFAULT_LANG);
});

test("normalizes only supported languages", () => {
  assert.equal(normalizeLanguage("es-ES"), "es");
  assert.equal(normalizeLanguage("en-US"), "en");
  assert.equal(normalizeLanguage("pt-BR"), "pt");
  assert.equal(normalizeLanguage("it-IT"), null);
});
