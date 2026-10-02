import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { parse } from "@babel/parser";

const frontendDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const panelSource = await readFile(join(frontendDir, "components/SimulationPanel.jsx"), "utf8");
const contextSource = await readFile(join(frontendDir, "contexts/LanguageContext.jsx"), "utf8");
const controllerSource = await readFile(
  join(frontendDir, "../backend/src/controllers/simulation.controller.js"), "utf8",
);
const messages = Object.fromEntries(await Promise.all(["es", "en", "pt"].map(async (lang) => [
  lang, JSON.parse(await readFile(join(frontendDir, `messages/${lang}.json`), "utf8")),
])));

function collectNodes(node, predicate, result = []) {
  if (!node || typeof node !== "object") return result;
  if (predicate(node)) result.push(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => collectNodes(child, predicate, result));
    else if (value && typeof value === "object") collectNodes(value, predicate, result);
  }
  return result;
}

const controllerAst = parse(controllerSource);
const catalogue = collectNodes(controllerAst, (node) =>
  node.type === "VariableDeclarator" && node.id.name === "SCENARIOS",
)[0].init;
const scenarios = JSON.parse(JSON.stringify(runInNewContext(
  controllerSource.slice(catalogue.start, catalogue.end),
)));
const contextAst = parse(contextSource, { sourceType: "module", plugins: ["jsx"] });
const translator = collectNodes(contextAst, (node) =>
  node.type === "VariableDeclarator" && node.id.name === "t",
)[0].init.arguments[0];

function getTranslator(lang) {
  return runInNewContext(contextSource.slice(translator.start, translator.end), {
    lang, messages, DEFAULT_LANG: "es",
  });
}

test("Simulation keeps the six backend IDs, free/premium flags and coin costs", () => {
  assert.deepEqual(scenarios.map(({ id }) => id), [
    "primer_mensaje", "coquetear", "continuar_conv", "pedir_cita", "superar_rechazo", "cita_perfecta",
  ]);
  assert.deepEqual(scenarios.map(({ isPremium }) => isPremium), [false, false, false, false, true, true]);
  assert.deepEqual(scenarios.map(({ coinCost }) => coinCost), [0, 0, 0, 0, 50, 75]);
});

test("all six scenarios resolve title, description, prompt and three tips through the existing t()", () => {
  for (const lang of ["es", "en", "pt"]) {
    const t = getTranslator(lang);
    assert.deepEqual(Object.keys(messages[lang].simulationPanel.scenarios), scenarios.map(({ id }) => id));
    for (const scenario of scenarios) {
      const prefix = `simulationPanel.scenarios.${scenario.id}`;
      for (const field of ["title", "description", "prompt"]) {
        const text = t(`${prefix}.${field}`);
        assert.equal(typeof text, "string");
        assert.ok(text.trim());
        assert.equal(text, messages[lang].simulationPanel.scenarios[scenario.id][field]);
        if (lang === "es") assert.equal(text, scenario[field]);
        else assert.notEqual(text, scenario[field], `${lang}: ${scenario.id}.${field} is still Spanish`);
      }
      const tips = Object.values(t(`${prefix}.tips`));
      assert.equal(tips.length, 3);
      tips.forEach((tip, index) => {
        assert.equal(typeof tip, "string");
        assert.ok(tip.trim());
        if (lang === "es") assert.equal(tip, scenario.tips[index]);
        else assert.notEqual(tip, scenario.tips[index]);
      });
      assert.deepEqual(Object.keys(messages[lang].simulationPanel.scenarios[scenario.id]).sort(),
        ["description", "prompt", "tips", "title"]);
    }
  }
});

test("cards, practice header, placeholder, tips and unlock title translate at render time", () => {
  const panelAst = parse(panelSource, { sourceType: "module", plugins: ["jsx"] });
  const calls = collectNodes(panelAst, (node) =>
    node.type === "CallExpression" && node.callee.name === "t"
      && node.arguments[0]?.type === "TemplateLiteral"
      && node.arguments[0].quasis[0].value.raw === "simulationPanel.scenarios.",
  );
  assert.deepEqual(calls.map((node) => panelSource.slice(node.start, node.end)), [
    "t(`simulationPanel.scenarios.${scenario.id}.title`)",
    "t(`simulationPanel.scenarios.${scenario.id}.description`)",
    "t(`simulationPanel.scenarios.${selected.id}.title`)",
    "t(`simulationPanel.scenarios.${selected.id}.prompt`)",
    "t(`simulationPanel.scenarios.${selected.id}.tips`)",
    "t(`simulationPanel.scenarios.${selected.id}.prompt`)",
    "t(`simulationPanel.scenarios.${unlockTarget.id}.title`)",
  ]);
  assert.doesNotMatch(panelSource, /\b(?:scenario|selected|unlockTarget)\.(?:title|description|prompt)\b/);
  for (const scenario of scenarios) {
    for (const lang of ["es", "en", "pt"]) {
      const t = getTranslator(lang);
      for (const call of calls) {
        const value = runInNewContext(panelSource.slice(call.start, call.end), {
          t, scenario, selected: scenario, unlockTarget: scenario,
        });
        const field = call.arguments[0].quasis[1].value.raw.slice(1);
        assert.equal(value, t(`simulationPanel.scenarios.${scenario.id}.${field}`));
      }
    }
  }
});

test("response submission, likes and unlock keep backend IDs and payloads in every language", async () => {
  const panelAst = parse(panelSource, { sourceType: "module", plugins: ["jsx"] });
  const handlers = collectNodes(panelAst, (node) =>
    node.type === "VariableDeclarator"
      && ["handleSubmit", "handleLike", "handleUnlock"].includes(node.id.name),
  );
  for (const lang of ["es", "en", "pt"]) {
    const selected = { ...scenarios[5], isUnlocked: false };
    const response = { _id: "response-id", text: "My original response", likesCount: 0, likedByMe: false };
    const state = { scenarios: [selected], responses: [], input: response.text };
    const requests = [];
    const scope = {
      t: getTranslator(lang), API_URL: "https://api.example.test", getToken: () => "test",
      useCallback: (callback) => callback,
      selected, unlockTarget: selected, input: response.text,
      submitting: false, unlocking: false, currentUser: { _id: "user-id" }, postedResponse: response,
      fetch: async (url, options) => {
        requests.push({ url, options });
        const body = url.endsWith("/like") ? { likesCount: 1, likedByMe: true }
          : url.endsWith("/unlock") ? { ok: true, scenarioId: selected.id, coinsRemaining: 25 }
            : response;
        return { ok: true, json: async () => body };
      },
    };
    for (const name of [
      "Scenarios", "Responses", "PostedResponse", "Input", "Selected", "UnlockTarget",
      "Submitting", "Unlocking", "Error", "UnlockError",
    ]) {
      const key = name[0].toLowerCase() + name.slice(1);
      scope[`set${name}`] = (value) => {
        state[key] = typeof value === "function" ? value(state[key]) : value;
      };
    }
    state.postedResponse = response;
    for (const handler of handlers) {
      const callback = runInNewContext(panelSource.slice(handler.init.start, handler.init.end), scope);
      await callback(response._id);
    }
    assert.deepEqual(requests.map(({ url }) => url), [
      `https://api.example.test/api/simulation/scenarios/${selected.id}/responses`,
      "https://api.example.test/api/simulation/responses/response-id/like",
      `https://api.example.test/api/simulation/scenarios/${selected.id}/unlock`,
    ]);
    assert.ok(requests.every(({ options }) => options.method === "POST"));
    assert.equal(requests[0].options.body, JSON.stringify({ text: response.text }));
    assert.equal(state.responses[0].text, response.text);
    assert.equal(state.responses[0].likesCount, 1);
    assert.equal(state.responses[0].likedByMe, true);
    assert.equal(state.scenarios[0].isUnlocked, true);
    assert.equal(state.scenarios[0].coinCost, 75);
    assert.equal(state.scenarios[0].isPremium, true);
    assert.equal(state.selected.id, selected.id);
    assert.equal(state.selected.isUnlocked, true);
    assert.equal(state.unlockTarget, null);
    assert.equal(state.error, "");
    assert.equal(state.unlockError, "");
  }
});
