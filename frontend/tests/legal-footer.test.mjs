import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "@babel/parser";
import { runInNewContext } from "node:vm";
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
  assert.equal(component.body.body.at(-1).argument.openingElement.name.name, "footer");
  assert.match(footerSource, /const isCompact = pathname === "\/profile"/);
  assert.doesNotMatch(footerSource, /useSession|PUBLIC_FOOTER_ROUTES/);
});

test("all requested compliance pages exist and login/register retain public footers", async () => {
  for (const path of ["", "login/", "register/", "contact/", "terms/", "acceptable-use/", "law-enforcement/", "child-safety/"]) {
    await assert.doesNotReject(readSource(`../app/${path}page.jsx`));
  }
  for (const path of ["/", "/login", "/register"]) {
    assert.equal(isBottomNavRoute(path), false);
    assert.notEqual(path, "/profile");
  }
});

test("ES/EN/PT policies explicitly prohibit child abuse and explain reporting obligations", async () => {
  for (const lang of ["es", "en", "pt"]) {
    const messages = JSON.parse(await readSource(`../messages/${lang}.json`));
    for (const key of ["terms", "acceptableUse", "childSafety"]) {
      const text = messages.legal.policies[key].sections.flatMap((section) => section.body).join(" ");
      for (const required of ["CSAM", "grooming", "NCMEC", "CyberTipline", "meetyoulive@gmail.com", "18"]) {
        assert.ok(text.includes(required), `${lang}/${key}: ${required}`);
      }
    }
    for (const key of ["adultsOnly", "ageConfirmation", "ageConfirmationRequired", "ageConfirmationNote", "loginAgeNotice"]) {
      assert.ok(messages.auth[key].includes("18"), `${lang}/${key}`);
    }
    const childSafety = messages.legal.policies.childSafety.sections.flatMap((section) => section.body).join(" ");
    assert.ok(childSafety.includes("https://report.cybertip.org"));
    assert.doesNotMatch(childSafety, /maintains internal procedures|mantiene procedimientos internos|mantém procedimentos internos/);
  }
});

test("registration requires adult confirmation before either email or Google, without changing callbacks", async () => {
  const source = await readSource("../app/register/RegisterForm.jsx");
  const ast = parse(source, { sourceType: "module", plugins: ["jsx"] });
  const component = ast.program.body.find((node) => node.type === "ExportDefaultDeclaration").declaration;
  const getHandler = (name, context) => {
    const handler = component.body.body
      .find((node) => node.type === "VariableDeclaration" && node.declarations[0].id.name === name)
      .declarations[0].init;
    return runInNewContext(`(${source.slice(handler.start, handler.end)})`, context);
  };
  for (const name of ["register", "handleGoogleSignIn"]) {
    const calls = [];
    const context = {
      ageConfirmed: false,
      setError: (message) => { if (message) calls.push(message); },
      setSuccess: () => {},
      t: (key) => key,
    };
    await getHandler(name, context)();
    assert.deepEqual(calls, ["auth.ageConfirmationRequired"]);
  }
  for (const native of [false, true]) {
    const calls = [];
    await getHandler("handleGoogleSignIn", {
      ageConfirmed: true,
      trackAnalyticsEvent: () => {},
      isNativeGoogleSignInAvailable: () => native,
      signIn: (provider, options) => calls.push([provider, options.callbackUrl]),
      startNativeGoogleLogin: async (path) => { calls.push(["native", path]); return true; },
      setError: () => {}, setSuccess: () => {}, setLoading: () => {}, t: (key) => key,
    })();
    assert.deepEqual(calls, [native ? ["native", "/feed"] : ["google", "/login?callbackUrl=/feed"]]);
  }
  const calls = [];
  await getHandler("register", {
    ageConfirmed: true, username: "adult", email: "adult@example.invalid",
    password: "password", confirmPassword: "password", refCode: "ref", inviteCode: "agency",
    setError: () => {}, setSuccess: () => {}, setLoading: () => {}, t: (key) => key,
    trackAnalyticsEvent: () => {},
    signUp: async (payload) => { calls.push(JSON.stringify(payload)); return { requiresVerification: true }; },
    setTimeout: (callback) => callback(),
    router: { push: (path) => calls.push(path) },
  })();
  assert.deepEqual(calls, [
    JSON.stringify({ username: "adult", email: "adult@example.invalid", password: "password", ref: "ref", agencyCode: "agency" }),
    "/verify-email?email=adult%40example.invalid",
  ]);
  assert.match(source, /useState\(false\)/);
  assert.equal((source.match(/disabled=\{loading \|\| !ageConfirmed\}/g) || []).length, 2);
});

test("login displays the adult restriction before Google and retains existing authentication", async () => {
  const source = await readSource("../app/login/page.jsx");
  const notice = source.indexOf('t("auth.loginAgeNotice")');
  assert.ok(notice > 0 && notice < source.indexOf('className="btn-google"'));
  assert.match(source, /authLogin\(\{ email, password \}\)/);
  assert.match(source, /callbackUrl: `\/login\?callbackUrl=\$\{encodeURIComponent\(userRedirectPath\)\}`/);
  const backend = await readSource("../../backend/src/controllers/onboarding.controller.js");
  assert.match(backend, /const MIN_AGE_YEARS = 18/);
  assert.match(backend, /!birthdate \|\| calculateAge\(birthdate, new Date\(\)\) < MIN_AGE_YEARS/);
});

test("contact displays the exact business address without relying on a form submission", async () => {
  const source = await readSource("../components/ContactPageContent.jsx");
  assert.match(source, /<h2>Business address<\/h2>\s*<address>/);
  for (const line of ["MEETYOULIVE TECHNOLOGIES LLC", "95 Hinsdale Rd, Apt B", "Nantucket, MA 02554", "United States"]) {
    assert.ok(source.includes(line), line);
  }
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
