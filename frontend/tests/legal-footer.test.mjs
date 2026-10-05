import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "@babel/parser";
import { LEGAL_POLICIES } from "../lib/legalPolicies.js";
import { isBottomNavRoute } from "../lib/bottomNavRoutes.js";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");
const footerSource = await readSource("../components/PublicFooterWrapper.jsx");
const footerAst = parse(footerSource, { sourceType: "module", plugins: ["jsx"] });
const footerLinks = footerAst.program.body
  .find((node) => node.type === "VariableDeclaration" && node.declarations[0].id.name === "FOOTER_LINKS")
  .declarations[0].init.elements.map((node) => node.value);
const requiredPolicies = {
  terms: "/terms",
  acceptableUse: "/acceptable-use",
  lawEnforcement: "/law-enforcement",
};

test("global footer includes direct links to all Stripe-required policies", () => {
  for (const [key, href] of Object.entries(requiredPolicies)) {
    assert.ok(footerLinks.includes(key), `${key} must be in the visible footer`);
    assert.equal(LEGAL_POLICIES.find((policy) => policy.key === key)?.href, href);
  }
  assert.match(footerSource, /<nav aria-label="Legal and support">/);
  assert.match(footerSource, /<Link key=\{policy.key\} href=\{policy.href\}>/);
  assert.match(footerSource, /t\(`legal\.policies\.\$\{policy\.key\}\.shortTitle`\)/);
});

test("root layout renders the same footer unconditionally for public and portal pages", async () => {
  const layout = await readSource("../app/layout.jsx");
  assert.match(layout, /<\/MainContentWrapper>\s*<PublicFooterWrapper \/>/);
  const component = footerAst.program.body
    .find((node) => node.type === "ExportDefaultDeclaration").declaration;
  assert.deepEqual(component.body.body.map((node) => node.type), [
    "VariableDeclaration",
    "VariableDeclaration",
    "ReturnStatement",
  ]);
  assert.equal(component.body.body.at(-1).argument.openingElement.name.name, "footer");
  assert.doesNotMatch(footerSource, /useSession|PUBLIC_FOOTER_ROUTES/);
});

test("footer clears fixed navigation without becoming an overlay on immersive routes", () => {
  for (const path of ["/dashboard", "/feed", "/profile", "/creator", "/settings"]) {
    assert.equal(isBottomNavRoute(path), true, path);
  }
  for (const path of ["/", "/terms", "/acceptable-use", "/law-enforcement", "/live/start", "/live/room-123", "/random"]) {
    assert.equal(isBottomNavRoute(path), false, path);
  }
  assert.match(footerSource, /isBottomNavRoute\(pathname\) \? " public-footer-bottom-nav" : ""/);
  assert.match(footerSource, /\.public-footer-bottom-nav\s*\{\s*padding-bottom: calc\(var\(--bottom-spacing-mobile\) \+ env\(safe-area-inset-bottom\)\);/);
  assert.match(footerSource, /flex-wrap: wrap/);
  assert.doesNotMatch(footerSource, /position:\s*(fixed|absolute)|z-index:/);
});

test("required policy labels remain localized in ES, EN, and PT", async () => {
  const expectedLabels = {
    es: ["Términos", "Uso aceptable", "Autoridades"],
    en: ["Terms", "Acceptable use", "Law Enforcement"],
    pt: ["Termos", "Uso aceitável", "Autoridades"],
  };
  for (const [lang, labels] of Object.entries(expectedLabels)) {
    const messages = JSON.parse(await readSource(`../messages/${lang}.json`));
    assert.deepEqual(
      Object.keys(requiredPolicies).map((key) => messages.legal.policies[key].shortTitle),
      labels,
    );
  }
});
