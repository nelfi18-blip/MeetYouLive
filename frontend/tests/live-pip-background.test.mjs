import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const androidManifestPath = join(__dirname, "../android/app/src/main/AndroidManifest.xml");
const mainActivityPath = join(__dirname, "../android/app/src/main/java/com/meetyoulive/app/MainActivity.java");
const livePipPluginPath = join(__dirname, "../android/app/src/main/java/com/meetyoulive/app/LivePipPlugin.java");
const livePipHookPath = join(__dirname, "../lib/livePip.js");
const livePagePath = join(__dirname, "../app/live/[id]/page.jsx");

test("Android manifest declares Picture-in-Picture support for the main Activity", async () => {
  const source = await readFile(androidManifestPath, "utf8");

  assert.match(source, /android:name="\.MainActivity"/);
  assert.match(source, /android:supportsPictureInPicture="true"/);
  assert.match(source, /android:resizeableActivity="true"/);
  assert.match(source, /<uses-feature android:name="android\.software\.picture-in-picture" android:required="false" \/>/);
});

test("MainActivity only enters PiP when a Live Agora session is active and PiP is supported", async () => {
  const source = await readFile(mainActivityPath, "utf8");

  assert.match(source, /registerPlugin\(LivePipPlugin\.class\);/);
  assert.match(source, /private static volatile boolean liveSessionActive = false;/);
  assert.match(source, /static void setLiveSessionActive\(boolean active\)/);
  assert.match(source, /public void onUserLeaveHint\(\)/);
  assert.match(source, /if \(!liveSessionActive\) return;/);
  assert.match(source, /if \(Build\.VERSION\.SDK_INT < Build\.VERSION_CODES\.O\) return;/);
  assert.match(source, /hasSystemFeature\(PackageManager\.FEATURE_PICTURE_IN_PICTURE\)/);
  assert.match(source, /enterPictureInPictureMode\(params\.build\(\)\);/);
});

test("LivePipPlugin exposes setActive/isSupported and resets the flag on destroy", async () => {
  const source = await readFile(livePipPluginPath, "utf8");

  assert.match(source, /@CapacitorPlugin\(name = "LivePip"\)/);
  assert.match(source, /public void setActive\(PluginCall call\)/);
  assert.match(source, /MainActivity\.setLiveSessionActive\(active\);/);
  assert.match(source, /public void isSupported\(PluginCall call\)/);
  assert.match(source, /protected void handleOnDestroy\(\)/);
  assert.match(source, /MainActivity\.setLiveSessionActive\(false\);/);
});

test("useLivePip only engages the native plugin on Android and mirrors the active flag", async () => {
  const source = await readFile(livePipHookPath, "utf8");

  assert.match(source, /registerPlugin\("LivePip"\)/);
  assert.match(source, /getMobilePlatform\(\) === "android"/);
  assert.match(source, /isNativeMobileApp\(\)/);
  assert.match(source, /LivePip\.setActive\(\{ active \}\)/);
  assert.match(source, /export default function useLivePip\(active\)/);
});

test("live room page wires useLivePip to the existing single agoraJoined flag (host and viewer)", async () => {
  const source = await readFile(livePagePath, "utf8");

  assert.match(source, /import useLivePip from "@\/lib\/livePip";/);
  assert.match(source, /useLivePip\(agoraJoined\);/);
});
