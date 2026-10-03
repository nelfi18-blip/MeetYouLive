import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";
import { runInNewContext } from "node:vm";

const frontendDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const pageSource = await readFile(join(frontendDir, "app/rooms/[id]/page.jsx"), "utf8");
const controllerSource = await readFile(
  join(frontendDir, "../backend/src/controllers/simulation.controller.js"), "utf8",
);

function collectNodes(node, predicate, result = []) {
  if (!node || typeof node !== "object") return result;
  if (predicate(node)) result.push(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => collectNodes(child, predicate, result));
    else if (value && typeof value === "object") collectNodes(value, predicate, result);
  }
  return result;
}

test("rooms/[id]/page.jsx imports the existing SimulationPanel component (no new panel created)", () => {
  assert.match(pageSource, /import SimulationPanel from "@\/components\/SimulationPanel";/);
});

test("Simulation availability is centralized in a single hasConversationPractice condition", () => {
  // `confianza_amor` must only be compared once (inside hasConversationPractice);
  // no other spot should hardcode that category to gate the Simulation tab/panel.
  const confianzaOccurrences = pageSource.match(/room\?\.category === "confianza_amor"/g) || [];
  assert.equal(confianzaOccurrences.length, 1, `expected exactly 1 occurrence, found ${confianzaOccurrences.length}`);

  assert.match(
    pageSource,
    /const hasConversationPractice =\s*\n?\s*room\?\.category === "confianza_amor" \|\| room\?\.category === "rompe_hielo";/,
  );

  // The tab bar and the SimulationPanel render must both consume the
  // centralized flag instead of re-checking room.category directly.
  assert.match(pageSource, /\{hasConversationPractice &&/);
  assert.match(pageSource, /activeTab === "simulation" && hasConversationPractice/);
  assert.doesNotMatch(pageSource, /activeTab === "simulation" && room\?\.category/);
});

test("confianza_amor and rompe_hielo enable conversation practice; consejos_citas and mala_suerte_amor do not", () => {
  function hasConversationPractice(category) {
    const room = { category };
    return room?.category === "confianza_amor" || room?.category === "rompe_hielo";
  }

  assert.equal(hasConversationPractice("confianza_amor"), true);
  assert.equal(hasConversationPractice("rompe_hielo"), true);
  assert.equal(hasConversationPractice("consejos_citas"), false);
  assert.equal(hasConversationPractice("mala_suerte_amor"), false);
});

test("the six backend Simulation scenario IDs, premium flags and coin costs remain untouched", () => {
  const controllerAst = parse(controllerSource);
  const catalogue = collectNodes(controllerAst, (node) =>
    node.type === "VariableDeclarator" && node.id.name === "SCENARIOS",
  )[0].init;
  const scenarios = JSON.parse(JSON.stringify(runInNewContext(
    controllerSource.slice(catalogue.start, catalogue.end),
  )));

  assert.deepEqual(scenarios.map(({ id }) => id), [
    "primer_mensaje", "coquetear", "continuar_conv", "pedir_cita", "superar_rechazo", "cita_perfecta",
  ]);
  assert.deepEqual(scenarios.map(({ isPremium }) => isPremium), [false, false, false, false, true, true]);
  assert.deepEqual(scenarios.map(({ coinCost }) => coinCost), [0, 0, 0, 0, 50, 75]);
});
