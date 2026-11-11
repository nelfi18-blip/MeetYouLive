import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  WORLD_MAP_DESTINATIONS, MIN_ZOOM, MAX_ZOOM, TILE_SIZE,
  clampZoom, clampLatitude, normalizeLongitude, project,
  unproject, panView, projectToScreen, getVisibleTiles,
} from "../lib/vcr/worldMapProjection.mjs";
const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("social World map uses only six public destination coordinates, never device/user GPS", () => {
  assert.deepEqual(WORLD_MAP_DESTINATIONS.map((p) => p.id), ["us", "fr", "jp", "ae", "br", "eg"]);
  for (const p of WORLD_MAP_DESTINATIONS) {
    assert.ok(Number.isFinite(p.lon) && Number.isFinite(p.lat));
    assert.ok(p.lat >= -85 && p.lat <= 85);
    assert.ok(p.flag);
  }
  assert.equal(new Set(WORLD_MAP_DESTINATIONS.map((p) => p.id)).size, 6);
  assert.equal(TILE_SIZE, 256);
});

test("mercator projections round trip and stay bounded even with extreme input", () => {
  for (const zoom of [MIN_ZOOM, 2, 3, MAX_ZOOM]) {
    for (const p of WORLD_MAP_DESTINATIONS) {
      const pixel = project(p.lon, p.lat, zoom);
      const inverse = unproject(pixel.x, pixel.y, zoom);
      assert.ok(Math.abs(inverse.lon - p.lon) < 1e-6, p.id);
      assert.ok(Math.abs(inverse.lat - p.lat) < 1e-6, p.id);
    }
  }
  assert.equal(clampZoom(100), MAX_ZOOM);
  assert.equal(clampZoom(-2), MIN_ZOOM);
  assert.ok(clampLatitude(100) <= 85.051129);
  assert.equal(normalizeLongitude(190), -170);
});

test("drag, zoom, wrapping and tile selection are bounded to visible viewport", () => {
  const view = { lon: 0, lat: 9, zoom: 2 };
  const moved = panView(view, 95, -40);
  assert.ok(moved.lon < 0);
  assert.ok(moved.lat < view.lat);
  const a = projectToScreen(-179, 0, { lon: 179, lat: 0, zoom: 3 }, 400, 500);
  assert.ok(a.x > 190 && a.x < 225, "antimeridian uses nearest tile");
  const tiles = getVisibleTiles(view, 390, 500);
  assert.ok(tiles.length > 0 && tiles.length <= 36);
  const max = 2 ** view.zoom;
  assert.ok(tiles.every((p) => p.z === view.zoom && p.x >= 0 && p.x < max && p.y >= 0 && p.y < max));
  assert.deepEqual(getVisibleTiles(view, 0, 300), []);
});

test("map is default and navigating to destination preserves the existing photo/AI path", async () => {
  const page = await source("app/vcr/page.jsx");
  const photo = await source("components/vcr/PhotoWorld.jsx");
  const map = await source("components/vcr/WorldSocialMap.jsx");
  assert.match(page, /useState\("map"\)/);
  assert.match(page, /onExploreCountry=\{\(id\) => \{ setCountry\(id\); setScreen\("photo"\); \}\}/);
  assert.match(page, /<PhotoWorld key=\{country\} initialCountry=\{country\}/);
  assert.match(photo, /initialCountry = "us"/);
  assert.match(photo, /useState\(initialCountry\)/);
  assert.match(page, /<AiWalkableWorld/);
  assert.match(page, /<WalkableWorld/);
  assert.match(map, /getVisibleTiles/);
  assert.match(map, /onPointerCancel/);
  assert.match(map, /onPointerMove/);
  assert.match(map, /onWheel/);
  assert.match(map, /referrerPolicy="strict-origin-when-cross-origin"/);
});

test("no fake profile pins, counterfeit location or automatic backend subscriptions", async () => {
  const map = await source("components/vcr/WorldSocialMap.jsx");
  assert.match(map, /WORLD_MAP_DESTINATIONS\.filter/);
  assert.doesNotMatch(map, /\/api\/user\/discover|\/api\/user\/me|navigator\.geolocation|vcr:join/);
  assert.doesNotMatch(map, /fakeProfiles|Math\.random|sampleUsers|syntheticUsers/);
  assert.match(map, /No simulated profiles/);
  assert.match(map, /No profiles have opted into appearing on this map yet/);
  assert.match(map, /OpenStreetMap contributors/);
});
