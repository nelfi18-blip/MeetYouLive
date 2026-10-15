import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const workflow = readFileSync(
  new URL("../../.github/workflows/ios-testflight-upload.yml", import.meta.url),
  "utf8",
);
const validation = workflow.match(
  /^ {10}if ! xcrun altool[\s\S]*?^ {10}echo "transferred=true" >> "\$GITHUB_OUTPUT"/m,
)?.[0].replace(/^ {10}/gm, "");
assert.ok(validation, "Exercise the actual altool command and response validation");

const success = JSON.stringify({
  "tool-version": "8.003.16021",
  "tool-path": "/Applications/Xcode.app/Contents/SharedFrameworks/ContentDeliveryServices.framework",
  "success-message": "No errors uploading archive",
});

const cases = [
  ["successful archive upload", success, 0, true],
  ["successful named IPA upload", '{"success-message":"No errors uploading \'App.ipa\'."}', 0, true],
  ["success with empty Apple errors", '{"success-message":"No errors uploading archive","product-errors":[]}', 0, true],
  ["Apple errors", '{"product-errors":[{"code":90189,"message":"Redundant Binary Upload"}]}', 0, false],
  ["Apple errors despite success message", '{"success-message":"No errors uploading archive","product-errors":[{"code":90189}]}', 0, false],
  ["null Apple errors are ambiguous", '{"success-message":"No errors uploading archive","product-errors":null}', 0, false],
  ["empty JSON object", "{}", 0, false],
  ["empty output", "", 0, false],
  ["unexpected JSON object", '{"status":0,"uploaded":true}', 0, false],
  ["unexpected success message", '{"success-message":"No errors validating archive"}', 0, false],
  ["misleading success suffix", '{"success-message":"No errors uploading archive but transfer pending"}', 0, false],
  ["non-string success message", '{"success-message":true}', 0, false],
  ["JSON array", "[]", 0, false],
  ["JSON null", "null", 0, false],
  ["invalid output", "not JSON", 0, false],
  ["truncated JSON", '{"success-message":', 0, false],
  ["multiple JSON documents", `{}\n${success}`, 0, false],
  ["trailing invalid output", `${success}\nnot JSON`, 0, false],
  ["nonzero exit despite success JSON", success, 1, false],
  ["nonzero exit with Apple errors", '{"product-errors":[{"code":90189}]}', 1, false],
];

for (const [name, response, exitCode, confirmed] of cases) {
  test(name, () => {
    const directory = mkdtempSync(join(tmpdir(), "altool-result-test-"));
    try {
      const output = join(directory, "output");
      writeFileSync(output, "");
      const result = spawnSync("bash", ["-c", `
        set -euo pipefail
        xcrun() {
          printf '%s' "$MOCK_RESPONSE"
          return "$MOCK_EXIT_CODE"
        }
        ${validation}
      `], {
        encoding: "utf8",
        env: {
          ...process.env,
          ASC_DIRECTORY: directory,
          GITHUB_OUTPUT: output,
          IPA_PATH: join(directory, "unused.ipa"),
          APP_STORE_CONNECT_KEY_ID: "unused",
          APP_STORE_CONNECT_ISSUER_ID: "unused",
          MOCK_RESPONSE: response,
          MOCK_EXIT_CODE: String(exitCode),
        },
      });
      assert.ifError(result.error);
      assert.equal(result.status, confirmed ? 0 : 1, result.stdout + result.stderr);
      assert.equal(readFileSync(output, "utf8"), confirmed ? "transferred=true\n" : "");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
