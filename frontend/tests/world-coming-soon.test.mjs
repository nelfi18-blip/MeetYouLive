import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("World menu leads to the new route but ordinary users see a teaser, not the unfinished world", async () => {
  const [menu, page] = await Promise.all([
    read("components/BottomNavEnhanced.jsx"),
    read("app/vcr/page.jsx"),
  ]);
  assert.match(menu, /id: "vcr"[\s\S]*?href: "\/vcr"/);
  assert.match(page, /WORLD_TEST_ONLY = process\.env\.NEXT_PUBLIC_WORLD_TEST_MODE === "isolated"/);
  assert.match(page, /if \(!WORLD_TEST_ONLY\) return <WorldComingSoon \/>;/);
  assert.match(page, /import WorldComingSoon from/);
  assert.match(page, /<WorldSocialMap/);
  assert.match(page, /<PhotoWorld key=\{country\}/);
  assert.match(page, /<WalkableWorld \{\.\.\.walkSession\}/);
});

test("construction message has no fabricated profiles, fake launch countdown or unusable sign-up action", async () => {
  const [source, css] = await Promise.all([
    read("components/vcr/WorldComingSoon.jsx"),
    read("components/vcr/WorldComingSoon.module.css"),
  ]);
  assert.match(source, /aria-labelledby="world-coming-soon-title"/);
  assert.match(source, /t\("worldComingSoon\.status"\)/);
  assert.match(source, /href="\/feed"/);
  assert.match(source, /!ISOLATED_TEST_PREVIEW &&/);
  assert.match(source, /NEXT_PUBLIC_WORLD_TEST_MODE === "isolated"/);
  assert.doesNotMatch(source, /fake|dummyProfile|setInterval|Date\.now|new Date\(/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /:focus-visible/);
  assert.match(source, /onClick=\{\(\) => setLang\(code\)\}/);
  assert.match(source, /aria-pressed=\{lang === code\}/);
});

for (const lang of ["es", "en", "pt"]) {
  test(`World teaser has trustworthy and complete ${lang} translations`, async () => {
    const dict = JSON.parse(await read(`messages/${lang}.json`));
    const copy = dict.worldComingSoon;
    for (const key of [
      "status", "eyebrow", "title", "subtitle", "featuresLabel",
      "destinationTitle", "destinationBody", "peopleTitle", "peopleBody",
      "experienceTitle", "experienceBody", "disclaimer", "backToApp",
    ]) {
      assert.ok(typeof copy[key] === "string" && copy[key].length > 8, key);
    }
    assert.equal(dict.nav.irMenu.vcr, "World");
    assert.match(dict.nav.irMenu.vcrDesc, /world/i);
    assert.equal(Object.keys(copy).length, 13);
    assert.match(copy.disclaimer, /no hay fecha|no launch date|não há data/i);
    assert.doesNotMatch(copy.disclaimer, /guaranteed|garantizado|garantido|100%/i);
  });
}

test("anonymous visual-review route renders only a noindex teaser, never the World engine", async () => {
  const [preview, access, actual] = await Promise.all([
    read("app/world-preview/page.jsx"),
    read("lib/publicAccess.js"),
    read("app/vcr/page.jsx"),
  ]);
  assert.match(preview, /import WorldComingSoon from/);
  assert.match(preview, /robots: \{ index: false, follow: false \}/);
  assert.match(preview, /return <WorldComingSoon \/>;/);
  assert.doesNotMatch(preview, /WorldSocialMap|PhotoWorld|WalkableWorld|AiWalkableWorld|token|user\/me/);
  assert.match(access, /"\/world-preview"/);
  const middleware = await read("middleware.js");
  assert.match(middleware, /if \(pathname === "\/world-preview"\)/);
  assert.match(middleware, /X-Robots-Tag", "noindex, nofollow"/);
  assert.match(access, /"\/vcr"/);
  assert.match(actual, /if \(!WORLD_TEST_ONLY\) return <WorldComingSoon \/>;/);
  const [nav, footer, wrapper, css] = await Promise.all([
    read("components/NavbarWrapper.jsx"),
    read("components/PublicFooterWrapper.jsx"),
    read("components/MainContentWrapper.jsx"),
    read("app/globals.css"),
  ]);
  assert.match(nav, /"\/world-preview"/);
  assert.match(footer, /pathname === "\/world-preview"/);
  assert.match(wrapper, /pathname === "\/world-preview" && "main-content-world-preview"/);
  assert.match(css, /main\.main-content\.main-content-world-preview \{\s*padding-bottom: max\(1rem, env\(safe-area-inset-bottom\)\)/);

});
