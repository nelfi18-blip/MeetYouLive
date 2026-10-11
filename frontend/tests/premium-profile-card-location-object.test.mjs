// Reproduction + regression test for the Discovery "Personas" crash caused
// by rendering `user.location` as a raw object.
//
// Root cause (confirmed by this test):
//   1. backend/src/models/User.js stores `location` as a Mongoose
//      sub-document (locationSchema: { country, city, region, label,
//      coordinates }), not a string. GET /api/user/discover's $project
//      (backend/src/routes/user.routes.js) forwards both `location` and
//      `locationLabel` as-is.
//   2. PremiumProfileCard.jsx used to render `<span>{user.location}</span>`
//      directly. When `location` is an object (the real schema shape),
//      React throws "Objects are not valid as a React child" during
//      render, crashing the Discovery "Personas" tab.
//
// This test renders the real PremiumProfileCard.jsx (JSX stripped via the
// SWC compiler already bundled with Next.js, see tests/helpers/jsxRequire.js)
// with object/string/empty/incomplete location payloads to prove the crash
// and guard against regressions, without touching the backend, the User
// model, discovery filters/geolocation, or the Premium design (SPARK/FADE/
// MAGNET/FLASH), which are asserted to survive untouched.
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

const BASE_USER = {
  _id: "u1",
  name: "Ana",
  role: "user",
  bio: "Amante de la música y los viajes",
  interests: ["música", "viajes"],
  languages: ["es", "en"],
};

test("REGRESSION: `location` as a real-schema object (country/city) no longer crashes the card", () => {
  // Before the fix this threw: "Objects are not valid as a React child
  // (found: object with keys {country, city})."
  const html = renderCard({ ...BASE_USER, location: { country: "US", city: "Boston" } });
  assert.match(html, /class="card-location"/);
  assert.match(html, />Boston, US</);
  assert.doesNotMatch(html, /\[object Object\]/);
});

test("`locationLabel` is prioritized over the `location` object when present", () => {
  const html = renderCard({
    ...BASE_USER,
    location: { country: "US", city: "Boston", region: "MA" },
    locationLabel: "Boston, Massachusetts",
  });
  assert.match(html, />Boston, Massachusetts</);
});

test("`location` object with a `label` field is used when `locationLabel` is absent", () => {
  const html = renderCard({ ...BASE_USER, location: { label: "Lisbon, Portugal", city: "Lisbon" } });
  assert.match(html, />Lisbon, Portugal</);
});

test("legacy `location` as a plain string still renders", () => {
  const html = renderCard({ ...BASE_USER, location: "Madrid" });
  assert.match(html, />Madrid</);
});

test("empty `location` object hides the location block instead of showing [object Object]", () => {
  const html = renderCard({ ...BASE_USER, location: {} });
  assert.doesNotMatch(html, /class="card-location"/);
  assert.doesNotMatch(html, /\[object Object\]/);
});

test("missing `location`/`locationLabel` (incomplete profile) hides the location block without crashing", () => {
  const html = renderCard({ _id: "u2", name: "Bob", role: "user" });
  assert.match(html, /Bob/);
  assert.doesNotMatch(html, /class="card-location"/);
});

test("`locationLabel` as an empty/whitespace string falls back to `location` object fields", () => {
  const html = renderCard({
    ...BASE_USER,
    locationLabel: "   ",
    location: { country: "BR", city: "Rio" },
  });
  assert.match(html, />Rio, BR</);
});

test("Premium design elements (SPARK/FADE/MAGNET/FLASH) survive the location fix", () => {
  const html = renderCard({
    ...BASE_USER,
    role: "creator",
    isLive: true,
    liveId: "live-1",
    location: { country: "US", city: "Boston" },
    creatorProfile: { privateCallEnabled: true, pricePerMinute: 25 },
  });
  assert.match(html, /SPARK/);
  assert.match(html, /FADE/);
  assert.match(html, /MAGNET/);
  assert.match(html, /FLASH/);
  assert.match(html, /EN VIVO/);
  assert.match(html, />Boston, US</);
});
