// Public cartography coordinates only. Never project device GPS or user home coordinates.
export const WORLD_MAP_DESTINATIONS = Object.freeze([
  { id: "us", flag: "🇺🇸", lon: -98.5, lat: 39.8 },
  { id: "fr", flag: "🇫🇷", lon: 2.35, lat: 48.86 },
  { id: "jp", flag: "🇯🇵", lon: 139.69, lat: 35.68 },
  { id: "ae", flag: "🇦🇪", lon: 55.27, lat: 25.2 },
  { id: "br", flag: "🇧🇷", lon: -43.2, lat: -22.91 },
  { id: "eg", flag: "🇪🇬", lon: 31.24, lat: 30.04 },
]);
export const TILE_SIZE = 256;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;
export const clampZoom = (zoom) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(zoom)));
export const clampLatitude = (lat) => Math.max(-85.05112878, Math.min(85.05112878, Number(lat) || 0));
export const normalizeLongitude = (lon) => ((((Number(lon) || 0) + 180) % 360) + 360) % 360 - 180;
export function project(lon, lat, zoom) {
  const n = TILE_SIZE * 2 ** clampZoom(zoom);
  const latitude = clampLatitude(lat) * Math.PI / 180;
  return {
    x: (normalizeLongitude(lon) + 180) / 360 * n,
    y: (1 - Math.log(Math.tan(latitude) + 1 / Math.cos(latitude)) / Math.PI) / 2 * n,
  };
}
export function unproject(x, y, zoom) {
  const n = TILE_SIZE * 2 ** clampZoom(zoom);
  const t = Math.PI * (1 - 2 * Math.max(0, Math.min(n, y)) / n);
  return {
    lon: normalizeLongitude(x / n * 360 - 180),
    lat: clampLatitude(180 / Math.PI * Math.atan(Math.sinh(t))),
  };
}
export function projectToScreen(lon, lat, view, width, height) {
  const point = project(lon, lat, view.zoom);
  const center = project(view.lon, view.lat, view.zoom);
  const extent = TILE_SIZE * 2 ** clampZoom(view.zoom);
  // Use the nearest wrapped copy of the destination across the antimeridian.
  let dx = point.x - center.x;
  if (dx > extent / 2) dx -= extent;
  if (dx < -extent / 2) dx += extent;
  return { x: width / 2 + dx, y: height / 2 + point.y - center.y };
}
export function panView(view, dx, dy) {
  const center = project(view.lon, view.lat, view.zoom);
  return { ...unproject(center.x - dx, center.y - dy, view.zoom), zoom: view.zoom };
}
export function getVisibleTiles(view, width, height) {
  if (width <= 0 || height <= 0) return [];
  const z = clampZoom(view.zoom), count = 2 ** z;
  const center = project(view.lon, view.lat, z);
  const left = Math.floor((center.x - width / 2) / TILE_SIZE);
  const top = Math.floor((center.y - height / 2) / TILE_SIZE);
  const right = Math.floor((center.x + width / 2) / TILE_SIZE);
  const bottom = Math.floor((center.y + height / 2) / TILE_SIZE);
  const tiles = [];
  for (let y = Math.max(0, top); y <= Math.min(count - 1, bottom); y++) {
    for (let x = left; x <= right; x++) {
      const wrappedX = ((x % count) + count) % count;
      tiles.push({
        key: `${z}-${x}-${y}`,
        z, x: wrappedX, y,
        left: x * TILE_SIZE - center.x + width / 2,
        top: y * TILE_SIZE - center.y + height / 2,
      });
    }
  }
  return tiles.slice(0, 36);
}

/**
 * Group nearby DESTINATION markers in the overview to avoid covering country
 * labels. Counts represent configured destinations, NEVER nearby users.
 * Zooming in separates the same actual public geographic points again.
 */
export function groupVisibleDestinations(destinations, view, width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return [];
  const points = destinations.map((place) => ({
    place, ...projectToScreen(place.lon, place.lat, view, width, height),
  })).filter((point) =>
    point.x >= -55 && point.x <= width + 55 &&
    point.y >= -55 && point.y <= height + 55
  );
  const visited = new Set();
  const groups = [];
  for (let start = 0; start < points.length; start++) {
    if (visited.has(start)) continue;
    const groupIndices = [start];
    visited.add(start);
    // Connected-component grouping keeps the result deterministic and avoids
    // creating synthetic location points or changing the actual destinations.
    for (let pos = 0; pos < groupIndices.length; pos++) {
      const current = points[groupIndices[pos]];
      for (let next = 0; next < points.length; next++) {
        if (visited.has(next)) continue;
        const candidate = points[next];
        if (Math.abs(current.x - candidate.x) <= 100 &&
            Math.abs(current.y - candidate.y) <= 72) {
          visited.add(next);
          groupIndices.push(next);
        }
      }
    }
    const members = groupIndices.map((index) => points[index]);
    const average = (key) => members.reduce((sum, entry) => sum + entry[key], 0) / members.length;
    groups.push({
      key: members.map((entry) => entry.place.id).sort().join("-"),
      x: average("x"), y: average("y"),
      places: members.map((entry) => entry.place),
    });
  }
  return groups;
}
