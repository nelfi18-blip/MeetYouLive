import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const globalsCssPath = join(__dirname, "../app/globals.css");

const PUBLIC_ROUTES = ["/", "/pricing", "/acceptable-use", "/terms", "/community-guidelines"];

test("html base rule no longer forces overflow-x/overflow-y, restoring native desktop scroll", async () => {
  const source = await readFile(globalsCssPath, "utf8");
  const htmlRule = source.match(/(?:^|\n)html\s*\{[^}]*\}/)?.[0] || "";
  assert.ok(htmlRule, "expected to find the base html { ... } rule in globals.css");
  assert.doesNotMatch(htmlRule, /overflow-x:\s*hidden;/);
  assert.doesNotMatch(htmlRule, /overflow-y:\s*auto;/);
  // Unrelated properties on the same rule must be preserved untouched.
  assert.match(htmlRule, /width:\s*100%;/);
  assert.match(htmlRule, /min-height:\s*100%;/);
  assert.match(htmlRule, /overscroll-behavior:\s*none;/);
  assert.match(htmlRule, /-webkit-text-size-adjust:\s*100%;/);
  assert.match(htmlRule, /text-size-adjust:\s*100%;/);
});

test("body rule keeps its own overflow handling and mobile touch scrolling untouched", async () => {
  const source = await readFile(globalsCssPath, "utf8");
  const bodyRule = source.match(/(?:^|\n)body\s*\{[^}]*\}/)?.[0] || "";
  assert.ok(bodyRule, "expected to find the base body { ... } rule in globals.css");
  assert.match(bodyRule, /overflow-x:\s*hidden;/);
  assert.match(bodyRule, /overflow-y:\s*auto;/);
  assert.match(bodyRule, /-webkit-overflow-scrolling:\s*touch;/);
});

test(".main-content rule is untouched by the html overflow fix", async () => {
  const source = await readFile(globalsCssPath, "utf8");
  const mainContentRule = source.match(/\.main-content\s*\{[^}]*\}/)?.[0] || "";
  assert.ok(mainContentRule, "expected to find the .main-content { ... } rule in globals.css");
  assert.match(mainContentRule, /overflow-x:\s*hidden;/);
  assert.match(mainContentRule, /overflow-y:\s*visible;/);
});

test("Android/Capacitor native mobile styles are untouched by the fix", async () => {
  const source = await readFile(globalsCssPath, "utf8");
  const nativeMobileRule = source.match(/\.native-mobile-app\s*\{[^}]*\}/)?.[0] || "";
  assert.ok(nativeMobileRule, "expected to find the .native-mobile-app { ... } rule in globals.css");
  assert.match(nativeMobileRule, /touch-action:\s*auto;/);

  const mobileMediaBlock = source.match(/@media \(max-width:\s*768px\)\s*\{\s*html,\s*body\s*\{[^}]*\}/)?.[0] || "";
  assert.ok(mobileMediaBlock, "expected the mobile @media html,body block in globals.css");
  assert.match(mobileMediaBlock, /overflow-y:\s*auto;/);
  assert.match(mobileMediaBlock, /-webkit-overflow-scrolling:\s*touch;/);
});

test("no JavaScript-based global scroll workaround was introduced", async () => {
  const source = await readFile(globalsCssPath, "utf8");
  assert.doesNotMatch(source, /document\.(body|documentElement)\.style\.overflow/);
});

test("the five public routes referenced in the scroll fix exist as pages", async () => {
  const routeToFile = {
    "/": "app/page.jsx",
    "/pricing": "app/pricing/page.jsx",
    "/acceptable-use": "app/acceptable-use/page.jsx",
    "/terms": "app/terms/page.jsx",
    "/community-guidelines": "app/community-guidelines/page.jsx",
  };
  for (const route of PUBLIC_ROUTES) {
    const relativePath = routeToFile[route];
    assert.ok(relativePath, `missing mapping for ${route}`);
    await assert.doesNotReject(
      readFile(join(__dirname, "..", relativePath), "utf8"),
      `expected ${relativePath} to exist for route ${route}`,
    );
  }
});
