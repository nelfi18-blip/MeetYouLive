import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const messagesDir = join(__dirname, "..", "messages");

const SUPPORTED_LANGS = ["es", "en", "pt"];

/**
 * Recursively flattens a nested translation object into a Set of
 * dot-notation keys, e.g. { gifts: { send: "..." } } -> "gifts.send".
 * Throws if a leaf value isn't a string, so structural mismatches
 * (e.g. a string in one file but an object in another) are caught too.
 */
function flattenKeys(obj, prefix = "", structure = new Map()) {
  const keys = new Set();
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    const isObject = value !== null && typeof value === "object" && !Array.isArray(value);
    structure.set(full, isObject ? "object" : typeof value);
    if (isObject) {
      for (const nested of flattenKeys(value, full, structure)) keys.add(nested);
    } else {
      keys.add(full);
    }
  }
  return keys;
}

async function loadMessages(lang) {
  const raw = await readFile(join(messagesDir, `${lang}.json`), "utf-8");
  return JSON.parse(raw);
}

test("es/en/pt message catalogs load as valid JSON", async () => {
  for (const lang of SUPPORTED_LANGS) {
    await assert.doesNotReject(loadMessages(lang), `${lang}.json must be valid JSON`);
  }
});

test("every translation key in es.json exists in en.json and pt.json (and vice versa)", async () => {
  const catalogs = {};
  const structures = {};
  for (const lang of SUPPORTED_LANGS) {
    const structure = new Map();
    const keys = flattenKeys(await loadMessages(lang), "", structure);
    catalogs[lang] = keys;
    structures[lang] = structure;
  }

  const missing = [];
  for (const lang of SUPPORTED_LANGS) {
    for (const otherLang of SUPPORTED_LANGS) {
      if (lang === otherLang) continue;
      for (const key of catalogs[lang]) {
        if (!catalogs[otherLang].has(key)) {
          missing.push(`"${key}" present in ${lang}.json but missing from ${otherLang}.json`);
        }
      }
    }
  }

  assert.equal(missing.length, 0, `Missing translation keys:\n${missing.join("\n")}`);
});

test("translation key structures are compatible across es/en/pt (no string/object mismatches)", async () => {
  const structures = {};
  for (const lang of SUPPORTED_LANGS) {
    const structure = new Map();
    flattenKeys(await loadMessages(lang), "", structure);
    structures[lang] = structure;
  }

  const mismatches = [];
  for (const key of structures.es.keys()) {
    const esType = structures.es.get(key);
    for (const lang of ["en", "pt"]) {
      const otherType = structures[lang].get(key);
      if (otherType && otherType !== esType) {
        mismatches.push(`"${key}" is ${esType} in es.json but ${otherType} in ${lang}.json`);
      }
    }
  }

  assert.equal(mismatches.length, 0, `Incompatible key structures:\n${mismatches.join("\n")}`);
});
