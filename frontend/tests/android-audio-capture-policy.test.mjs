import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const manifestUrl = new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url);
const androidVersionsUrl = new URL("../android/variables.gradle", import.meta.url);

test("Android playback audio is not capturable by third-party apps by default", async () => {
  const [manifest, versions] = await Promise.all([
    readFile(manifestUrl, "utf8"),
    readFile(androidVersionsUrl, "utf8"),
  ]);
  assert.match(versions, /targetSdkVersion\s*=\s*36\b/);
  const application = manifest.match(/<application\b[^>]+>/)?.[0];
  assert.ok(application, "Android <application> tag must exist");
  assert.match(application, /android:allowAudioPlaybackCapture="false"/);
  assert.equal((manifest.match(/android:allowAudioPlaybackCapture=/g) || []).length, 1);
});

test("Audio playback restriction preserves camera, microphone and native Live PiP", async () => {
  const manifest = await readFile(manifestUrl, "utf8");
  assert.match(manifest, /android\.permission\.CAMERA/);
  assert.match(manifest, /android\.permission\.RECORD_AUDIO/);
  assert.match(manifest, /android:supportsPictureInPicture="true"/);
});
