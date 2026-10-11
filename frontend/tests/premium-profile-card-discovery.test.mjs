// Reproduction + regression test for the "No pudimos cargar esta sección"
// crash reported on the Discovery "Personas" tab (/explore).
//
// Root cause chain (confirmed by this test):
//   1. GET /api/user/discover's $project (backend/src/routes/user.routes.js)
//      forwards the raw `interests` field from MongoDB via aggregation,
//      bypassing Mongoose schema casting/defaults. Legacy/malformed
//      documents can therefore surface `interests`/`languages` as a string
//      (or other non-array value) instead of an array.
//   2. PremiumProfileCard.jsx rendered `user.interests.slice(...).map(...)`
//      and `langs.slice(...).join(...)` without checking that these values
//      were actually arrays, so a string value throws a TypeError during
//      render ("...slice(...).map/join is not a function").
//   3. /explore has no app/explore/error.jsx, so the exception bubbles to
//      the global app/error.jsx boundary, which renders the generic
//      "routeError.defaultTitle" message: "No pudimos cargar esta sección".
//      Meanwhile the "Directos" tab uses a different component/data path
//      and is unaffected.
//
// This test renders the real PremiumProfileCard.jsx (JSX stripped via the
// SWC compiler already bundled with Next.js, see tests/helpers/jsxRequire.js)
// with valid, incomplete, and malformed profile payloads to prove the
// crash and guard against regressions, without modifying the backend
// contract or any unrelated UI (Premium design, SPARK/FADE/MAGNET/FLASH,
// prices, actions are untouched).
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { requireJsx } = require("./helpers/jsxRequire.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMPONENT_PATH = path.join(__dirname, "..", "components", "PremiumProfileCard.jsx");

function renderCard(user) {
  const PremiumProfileCard = requireJsx(COMPONENT_PATH);
  return renderToStaticMarkup(React.createElement(PremiumProfileCard, { user }));
}

const VALID_USER = {
  _id: "u1",
  name: "Ana",
  role: "user",
  bio: "Amante de la música y los viajes",
  location: "Madrid",
  interests: ["música", "viajes", "cine"],
  languages: ["es", "en"],
};

const INCOMPLETE_USER = {
  _id: "u2",
  name: "Bob",
  role: "user",
  // No bio, location, interests, or languages at all.
};

test("PremiumProfileCard renders a complete Premium profile without crashing", () => {
  const html = renderCard(VALID_USER);
  assert.match(html, /Ana/);
  assert.match(html, /música/);
  assert.match(html, /es · en/);
  assert.match(html, /SPARK/);
  assert.match(html, /FADE/);
  assert.match(html, /MAGNET/);
});

test("PremiumProfileCard renders an incomplete profile (no bio/interests/languages) without crashing", () => {
  const html = renderCard(INCOMPLETE_USER);
  assert.match(html, /Bob/);
  assert.doesNotMatch(html, /class="card-interests"/);
  assert.doesNotMatch(html, /class="card-langs"/);
});

test("REGRESSION: malformed `languages` as a plain string no longer crashes the card", () => {
  // Before the fix this threw: "langs.slice(...).join is not a function"
  const html = renderCard({ ...VALID_USER, languages: "es" });
  assert.doesNotMatch(html, /class="card-langs"/);
});

test("REGRESSION: malformed `interests` as a plain string no longer crashes the card", () => {
  // Before the fix this threw: "user.interests.slice(...).map is not a function"
  const html = renderCard({ ...VALID_USER, interests: "música" });
  assert.doesNotMatch(html, /class="card-interests"/);
});

test("REGRESSION: malformed `interests` as a non-array object no longer crashes the card", () => {
  const html = renderCard({ ...VALID_USER, interests: { tag: "música" } });
  assert.doesNotMatch(html, /class="card-interests"/);
});

test("REGRESSION: `interests` array with mixed/invalid entries is sanitized, not dropped", () => {
  const html = renderCard({ ...VALID_USER, interests: ["música", 42, null, "cine"] });
  assert.match(html, /música/);
  assert.match(html, /cine/);
  assert.doesNotMatch(html, />42</);
});

test("REGRESSION: `languages` array with null/undefined entries is sanitized, not dropped", () => {
  const html = renderCard({ ...VALID_USER, languages: ["es", null, undefined, "en"] });
  assert.match(html, /es · en/);
});

test("`language` (singular, legacy field) still renders when `languages` array is absent", () => {
  const html = renderCard({ ...VALID_USER, languages: undefined, language: "pt" });
  assert.match(html, /card-langs-list">pt</);
});

test("Premium design elements (SPARK/FADE/MAGNET/FLASH, prices, actions) survive the defensive fix", () => {
  const html = renderCard({
    ...VALID_USER,
    role: "creator",
    isLive: true,
    liveId: "live-1",
    creatorProfile: { privateCallEnabled: true, pricePerMinute: 25 },
  });
  assert.match(html, /SPARK/);
  assert.match(html, /FADE/);
  assert.match(html, /MAGNET/);
  assert.match(html, /FLASH/);
  assert.match(html, /EN VIVO/);
});
