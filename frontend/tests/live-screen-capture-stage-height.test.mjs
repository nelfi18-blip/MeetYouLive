import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8");

test("Live capture boundary still blocks the room until screen protection is ready", async () => {
  const [room, boundary] = await Promise.all([
    read("../app/live/[id]/page.jsx"),
    read("../components/ScreenCaptureBoundary.jsx"),
  ]);

  assert.match(room, /<ScreenCaptureBoundary capture=\{capture\}>\{capture\.ready && <LiveRoomContent \/>\}<\/ScreenCaptureBoundary>/);
  assert.match(boundary, /<div aria-hidden=\{!capture\.ready\} inert=\{!capture\.ready\}/);
  assert.match(boundary, /style=\{capture\.ready\s*\?\s*undefined\s*:\s*\{\s*visibility:\s*"hidden",\s*opacity:\s*0,\s*pointerEvents:\s*"none"\s*\}\s*\}/);
});

test("mobile Live styles account for the additional ready capture boundary DOM wrapper", async () => {
  const css = await read("../app/globals.css");

  // The original direct-child contract remains valid for unguarded markup,
  // but a protected room is now one div deeper after PR #1139.
  assert.match(css, /main\.main-content:has\(> \.room\)/);
  assert.match(css, /main\.main-content:has\(> \[aria-hidden="false"\] > \.room\)/);
  assert.match(css, /main\.main-content:has\(> \[aria-hidden="false"\] > \.room\)[^{]*\{[^}]*min-height:\s*100dvh;[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/);

  // This wrapper is the *direct flex child* of main. Styling just main/room
  // leaves an auto-sized div in between and collapses the video height to 0.
  assert.match(
    css,
    /main\.main-content:has\(> \[aria-hidden="false"\] > \.room\) > \[aria-hidden="false"\]\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;/,
  );
  // Only a ready LiveRoomContent can satisfy this selector; a failed/absent
  // native guard keeps its content unmounted and hidden.
  assert.doesNotMatch(css, /main\.main-content:has\(> \[aria-hidden="true"\] > \.room\)/);
});

test("guarded Live retains its mobile safe-area and portrait-only height rules", async () => {
  const css = await read("../app/globals.css");
  const room = await read("../app/live/[id]/page.jsx");

  assert.match(css, /main\.main-content:has\(> \[aria-hidden="false"\] > \.room\)\s*\{\s*padding:\s*max\(0\.25rem/);
  assert.match(css, /\.native-mobile-app main\.main-content:has\(> \[aria-hidden="false"\] > \.room\)\s*\{[^}]*min-height:\s*calc\(100dvh\s*-\s*env\(safe-area-inset-top/);
  assert.match(room, /grid-template-rows:\s*1fr auto auto;/);
  assert.match(room, /\.video-wrap\s*\{\s*aspect-ratio:\s*auto;\s*max-height:\s*none;\s*height:\s*100%;/);
});
