import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

for (const workflow of ["android-debug-apk", "android-release-apk", "android-release-aab"]) {
  test(workflow + " skips auto builds on the GPS Draft and enforces www", async () => {
    const s = await readFile(new URL("../../.github/workflows/" + workflow + ".yml", import.meta.url), "utf8");
    assert.match(s, /github\.head_ref != 'feat\/android-profile-gps-location'/);
    assert.ok(s.includes("default: 'https://www.meetyoulive.net'"));
    assert.ok(s.includes("|| 'https://www.meetyoulive.net'"));
    assert.ok(s.includes('if [ "$NEXT_PUBLIC_APP_URL" != "https://www.meetyoulive.net" ]; then'));
    assert.ok(s.includes('cfg.server?.url !== "https://www.meetyoulive.net"'));
    assert.ok(!s.includes("https://meetyoulive.net"));
  });
}
