import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Live main stage tiles remain visible when CSS animations are disabled", async () => {
  const grid = await read("../components/MultiVideoGrid.jsx");
  assert.match(grid, /\.video-tile\s*\{[\s\S]*?opacity:\s*1;[\s\S]*?animation:\s*fadeIn/);
  assert.match(grid, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.video-tile\s*\{\s*animation:\s*none;\s*opacity:\s*1;/);
});

test("Agora's dynamically inserted video fills its stage tile", async () => {
  const grid = await read("../components/MultiVideoGrid.jsx");
  assert.match(grid, /\.video-player\s+:global\(video\)\s*\{[\s\S]*?width:\s*100%;[\s\S]*?height:\s*100%;[\s\S]*?object-fit:\s*cover;/);
  // The existing local & remote track play paths must stay owned by the room
  // and the grid respectively; CSS must not replace Agora playback behavior.
  const room = await read("../app/live/[id]/page.jsx");
  assert.match(room, /onLocalVideoMount=\{handleLocalVideoMount\}/);
  assert.match(grid, /videoTrack\.play\(container\)/);
});

test("stage visibility fix preserves capture gate and floating mini-player", async () => {
  const room = await read("../app/live/[id]/page.jsx");
  assert.match(room, /capture\.ready && <LiveRoomContent \/>/);
  const mini = await read("../components/live/MiniPlayer.jsx");
  assert.match(mini, /suspended\.localVideoTrack\.play\(videoContainerRef\.current\)/);
});
