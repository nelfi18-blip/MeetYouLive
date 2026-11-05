// Pure protocol/physics shared with the browser bundle. No server dependencies.
const VERSION = 1;
const SPEED = 7;
const LIMIT = 72;
const OUTFITS = ["violet", "cyan", "pink"];
const zones = { central: { x: 0, z: 0 }, neon: { x: 0, z: -36 }, coast: { x: -48, z: 36 }, park: { x: 36, z: 36 } };
const buildings = (height, width = 14) => [-24, 24].flatMap((x) => [-36, 0].map((z, i) => ({ x, z, w: width, d: 14, h: height + i * 7 })));
const DESTINATIONS = {
  us: { theme: "boulevard", sky: 0xabcbdc, fog: 0xc8d8df, ground: 0xa9ad99, buildings: [...buildings(29), { x: 0, z: -58, w: 16, d: 14, h: 43 }] },
  fr: { theme: "paris", sky: 0xb7c8dc, fog: 0xd9d5ce, ground: 0xb7af9f, buildings: buildings(13, 19) },
  jp: { theme: "tokyo", sky: 0x192744, fog: 0x3c4567, ground: 0x505569, buildings: buildings(21, 16) },
  ae: { theme: "dubai", sky: 0xc9d9df, fog: 0xe7d6ba, ground: 0xd6c7aa, buildings: [...buildings(36, 12), { x: 0, z: -58, w: 12, d: 12, h: 46 }] },
  br: { theme: "rio", sky: 0x9ad6e1, fog: 0xc2e1d7, ground: 0xb9c593, buildings: buildings(15, 16) },
  eg: { theme: "giza", sky: 0xd7c5a4, fog: 0xe5cba6, ground: 0xd2b17f, buildings: [
    { x: 0, z: -58, w: 29, d: 29, h: 24 }, { x: 30, z: -37, w: 23, d: 23, h: 18 },
    { x: 40, z: 0, w: 14, d: 18, h: 8 },
  ] },
};
function walkable(country, x, z) {
  const world = DESTINATIONS[country];
  return !!world && Number.isFinite(x) && Number.isFinite(z) && Math.abs(x) <= LIMIT && Math.abs(z) <= LIMIT &&
    !world.buildings.some((b) => Math.abs(x - b.x) < b.w / 2 + 0.85 && Math.abs(z - b.z) < b.d / 2 + 0.85);
}
function step(country, position, input, dt) {
  const delta = Math.min(Math.max(Number.isFinite(dt) ? dt : 0, 0), 0.05);
  const yaw = Number.isFinite(input.yaw) ? input.yaw : 0;
  const forward = Number(!!input.forward) - Number(!!input.backward);
  const side = Number(!!input.right) - Number(!!input.left);
  let dx = -Math.sin(yaw) * forward + Math.cos(yaw) * side;
  let dz = -Math.cos(yaw) * forward - Math.sin(yaw) * side;
  const length = Math.hypot(dx, dz);
  if (length) { dx = dx / length * SPEED * delta; dz = dz / length * SPEED * delta; }
  let { x, z } = position;
  if (walkable(country, x + dx, z)) x += dx;
  if (walkable(country, x, z + dz)) z += dz;
  return { x, z, yaw: length ? Math.atan2(dx, dz) : position.yaw || 0, moving: length > 0 && (x !== position.x || z !== position.z) };
}
function validPosition(country, position, previous, elapsed) {
  return position && [position.x, position.z, position.yaw].every(Number.isFinite) &&
    walkable(country, position.x, position.z) && Math.abs(position.yaw) <= Math.PI * 2 &&
    Math.hypot(position.x - previous.x, position.z - previous.z) <= SPEED * Math.min(Math.max(elapsed, 0), 0.5) + 0.45;
}
module.exports = { VERSION, SPEED, LIMIT, OUTFITS, DESTINATIONS, zones, walkable, step, validPosition };
