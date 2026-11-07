import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the stage notifies its parent when the actual local camera tile is mounted", async () => {
  const [grid, room] = await Promise.all([
    read("../components/MultiVideoGrid.jsx"),
    read("../app/live/[id]/page.jsx"),
  ]);
  assert.match(grid, /onLocalVideoMount = null,/);
  assert.match(grid, /const setLocalVideoContainer = useCallback\(\(element\) =>/);
  assert.match(grid, /if \(localVideoRef\) localVideoRef\.current = element/);
  assert.match(grid, /if \(element\) onLocalVideoMount\?\.\(element\)/);
  assert.match(grid, /ref=\{setLocalVideoContainer\} className="video-player local-video"/);
  assert.match(room, /const handleLocalVideoMount = useCallback\(\(element\) =>/);
  assert.match(room, /track\.play\(element\)/);
  assert.match(room, /onLocalVideoMount=\{handleLocalVideoMount\}/);
});

test("the original join/resume/track-recovery playback paths remain intact", async () => {
  const room = await read("../app/live/[id]/page.jsx");
  assert.match(room, /localVideoTrackRef\.current\.play\(localVideoContainerRef\.current\)/);
  assert.match(room, /localVideo\.play\(localVideoContainerRef\.current\)/);
  assert.match(room, /nextVideo\.play\(localVideoContainerRef\.current\)/);
  assert.match(room, /capture\.ready && <LiveRoomContent \/>/);
});
