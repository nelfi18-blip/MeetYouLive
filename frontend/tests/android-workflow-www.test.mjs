import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const canonical = "https://www.meetyoulive.net";

for (const workflow of ["android-debug-apk", "android-release-apk", "android-release-aab"]) {
  test(`${workflow} only packages canonical www WebView URLs`, async () => {
    const contents = await readFile(new URL(`../../.github/workflows/${workflow}.yml`, import.meta.url), "utf8");
    assert.ok(contents.includes(`default: '${canonical}'`), "workflow_dispatch default must use www");
    assert.ok(contents.includes(`|| '${canonical}'`), "Capacitor URL fallback must use www");
    assert.ok(contents.includes(`if [ "$NEXT_PUBLIC_APP_URL" != "${canonical}" ]; then`), "explicit overrides must be rejected if not canonical");
    assert.ok(contents.includes("android/app/src/main/assets/capacitor.config.json"), "generated native config must be checked");
    assert.ok(contents.includes(`cfg.server?.url !== "${canonical}"`), "post-sync must assert canonical origin");
    assert.ok(!contents.includes("https://meetyoulive.net"), "non-www URL must not appear");
    assert.ok(contents.includes("github.head_ref != 'fix/android-sensitive-screen-capture'"), "retain no-auto-packaging protection for #1139");
  });
}

test("Capacitor fallback and native error-screen URL use the www domain", async () => {
  const cap = await readFile(new URL("../capacitor.config.ts", import.meta.url), "utf8");
  const activity = await readFile(new URL("../android/app/src/main/java/com/meetyoulive/app/MainActivity.java", import.meta.url), "utf8");
  assert.ok(cap.includes(`'https://www.meetyoulive.net'`));
  assert.ok(activity.includes(`private static final String APP_URL = "${canonical}"`));
});
