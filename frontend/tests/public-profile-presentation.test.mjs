import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  getPublicAge,
  getPublicLocationLabel,
  formatPublicNameAge,
} from "../lib/publicProfilePresentation.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFile(resolve(here, "..", path), "utf8");

test("discovery presents a single public name followed by a real age", () => {
  assert.equal(formatPublicNameAge("Kelly", 45), "Kelly, 45");
  assert.equal(formatPublicNameAge("María", null), "María");
  assert.equal(formatPublicNameAge("Estrella", 28), "Estrella, 28");
  assert.equal(getPublicAge({ age: "45" }), 45);
  assert.equal(getPublicAge({ age: 0 }), null);
  assert.equal(getPublicAge({ age: 15 }), null);
  assert.equal(getPublicAge({ age: -1 }), null);
  assert.equal(getPublicAge({ age: "unknown" }), null);
  assert.equal(getPublicAge({ birthdate: "1990-01-01" }), null);
});

test("location on cards is coarse city and country, never map coordinates", () => {
  assert.equal(
    getPublicLocationLabel({
      location: {
        city: "Guwahati", region: "Assam", country: "India",
        label: "Guwahati, Assam, India", coordinates: [91.8, 26.1],
      },
    }),
    "Guwahati, India"
  );
  assert.equal(getPublicLocationLabel({ location: { country: "Brazil", coordinates: [0, 0] } }), "Brazil");
  assert.equal(getPublicLocationLabel({ location: "Boston, Massachusetts, USA" }), "Boston, USA");
  assert.equal(getPublicLocationLabel({ location: "-71.0688, 42.3601" }), "");
  assert.equal(getPublicLocationLabel({}), "");
});

test("main mobile swipe card puts name, age, then location and keeps primary photo", async () => {
  const card = await read("components/SwipeCard.jsx");
  const start = card.indexOf('className="swipe-card-name-age"');
  const age = card.indexOf('className="swipe-card-age"');
  const place = card.indexOf('className="swipe-card-location"');
  const tags = card.indexOf('className="swipe-card-interests"');
  assert.ok(start >= 0 && start < age && age < place && place < tags);
  assert.match(card, /className="swipe-card-name-text"/);
  assert.match(card, /getPublicAge\(profile\)/);
  assert.match(card, /getPublicLocationLabel\(profile\)/);
  assert.match(card, /className="swipe-card-image"/);
});

test("feed sanitizer does not reintroduce full names, handles or raw date of birth", async () => {
  const page = await read("app/feed/page.jsx");
  assert.match(page, /const name = getDisplayName\(profile\)/);
  assert.match(page, /delete publicProfile\.lastName/);
  assert.match(page, /delete publicProfile\.birthdate/);
  assert.match(page, /const username = name/);
});
