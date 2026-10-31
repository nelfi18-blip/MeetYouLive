import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");

// Regression coverage for the production ReferenceError: `t is not defined`
// thrown by /admin/payouts and /admin/withdrawals/history (both render
// components/admin/PayoutsPage.jsx). AdminPayoutsPage used `t("adminPayouts.
// loading")` inside its Suspense `fallback` prop, but `t` is only provided by
// `useLanguage()` inside `AdminPayoutsContent` — a sibling component, not an
// ancestor scope — so the identifier was never defined where it was called.
//
// This test statically extracts every top-level function component in the
// file and asserts that any component calling `t(...)` either destructures
// `t` from `useLanguage()` within its own body, or receives `t` as a
// prop/parameter. This generalizes beyond the specific fallback bug to catch
// any future translation call placed outside of its providing scope.

/**
 * Splits `source` into top-level `function Name(...) { ... }` blocks
 * (including `export default function Name(...) { ... }`) using brace
 * matching, returning [{ name, params, body }].
 */
function extractTopLevelFunctionComponents(source) {
  const components = [];
  const declRe = /(?:export default\s+)?function\s+([A-Z][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*\{/g;
  let match;
  while ((match = declRe.exec(source)) !== null) {
    const [fullMatch, name, params] = match;
    const bodyStart = match.index + fullMatch.length;
    let depth = 1;
    let i = bodyStart;
    for (; i < source.length && depth > 0; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") depth--;
    }
    const body = source.slice(bodyStart, i - 1);
    components.push({ name, params, body });
  }
  return components;
}

test("every top-level component calling t(...) has `t` in its own scope (useLanguage() or a parameter/prop)", async () => {
  const source = await readSource("../components/admin/PayoutsPage.jsx");
  const components = extractTopLevelFunctionComponents(source);

  assert.ok(components.length >= 4, "expected to find the known PayoutsPage components");

  const offenders = [];
  for (const { name, params, body } of components) {
    const callsT = /\bt\(/.test(body);
    if (!callsT) continue;

    const declaresUseLanguage = /const\s*\{[^}]*\bt\b[^}]*\}\s*=\s*useLanguage\(\)/.test(body);
    const receivesTAsParam = /\bt\b/.test(params);

    if (!declaresUseLanguage && !receivesTAsParam) {
      offenders.push(name);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `component(s) call t(...) without t in scope: ${offenders.join(", ")}`
  );
});

test("AdminPayoutsPage's Suspense fallback no longer calls t(...) in a scope where t is undefined", async () => {
  const source = await readSource("../components/admin/PayoutsPage.jsx");

  const pageMatch = source.match(/export default function AdminPayoutsPage\(\)\s*\{[\s\S]*?\n\}/);
  assert.ok(pageMatch, "AdminPayoutsPage not found");
  assert.doesNotMatch(
    pageMatch[0],
    /\bt\(/,
    "AdminPayoutsPage must not call t(...) directly; it does not declare useLanguage() itself"
  );

  // The fallback must be rendered by a component that owns its own `t`.
  assert.match(source, /function AdminPayoutsFallback\(\)\s*\{\s*const\s*\{\s*t\s*\}\s*=\s*useLanguage\(\);/);
  assert.match(source, /<Suspense fallback=\{<AdminPayoutsFallback \/>\}>/);
});
