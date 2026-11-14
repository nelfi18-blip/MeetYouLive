import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const workflow = (path) => readFile(new URL("../../.github/workflows/" + path, import.meta.url), "utf8");

test("Android release behavior is unchanged unless the R8 trial is explicitly opted into", async () => {
  const gradle = await source("android/app/build.gradle");
  assert.match(gradle, /findProperty\("meetyouliveR8Trial"\)\s*\?:\s*"false"/);
  assert.match(gradle, /toString\(\)\.equalsIgnoreCase\("true"\)/);
  assert.match(gradle, /minifyEnabled r8TrialEnabled/);
  assert.match(gradle, /shrinkResources r8TrialEnabled/);
  assert.match(gradle, /r8TrialEnabled \? 'proguard-android-optimize\.txt' : 'proguard-android\.txt'/);
  assert.doesNotMatch(gradle, /minifyEnabled true|shrinkResources true/);
});

test("no automatic APK or AAB is built by the isolated R8 trial PR", async () => {
  for (const name of ["android-release-aab.yml", "android-release-apk.yml", "android-debug-apk.yml"]) {
    const yaml = await workflow(name);
    assert.match(yaml, /github\.head_ref != 'fix\/android-r8-opt-in-2026-11-11'/, name);
    assert.match(yaml, /github\.event_name != 'pull_request'/, name);
    assert.match(yaml, /workflow_dispatch:/, name);
  }
});

test("R8 trial preserves production app ID, signing, native auth and billing dependencies", async () => {
  const gradle = await source("android/app/build.gradle");
  assert.match(gradle, /applicationId "com\.meetyoulive\.app"/);
  assert.match(gradle, /signingConfig signingConfigs\.release/);
  assert.match(gradle, /androidKeystorePath/);
  assert.match(gradle, /androidx\.credentials:credentials:1\.6\.0/);
  assert.match(gradle, /com\.android\.billingclient:billing:8\.0\.0/);
  assert.match(gradle, /implementation project\(':capacitor-android'\)/);
});
