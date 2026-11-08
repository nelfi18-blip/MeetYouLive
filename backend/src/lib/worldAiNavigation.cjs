"use strict";

/**
 * World AI: deterministic, SERVER-REUSABLE collision/navigation core.
 * This is not a generated world. Inputs MUST be baked offline from a
 * licensed provider GLB collider, reviewed, and bound to the same SPZ world.
 *
 * Never infer walkable space from a rendered splat, a panorama, or the old
 * procedural World collision objects. No production route consumes this yet.
 */
const VERSION = 1;
const SPEED = 7;
const RADIUS = 0.3;
const STEP_HEIGHT = 0.4;
const MAX_CELLS = 256 * 256;
const COUNTRIES = new Set(["us", "fr", "jp", "ae", "br", "eg"]);
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;

function check(condition, message) {
  if (!condition) throw new Error("World AI navigation: " + message);
}
function finite(value, min, max) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}
function makeNavigation(raw) {
  check(raw && typeof raw === "object" && !Array.isArray(raw), "manifest required");
  check(raw.schemaVersion === VERSION, "unknown schema version");
  check(COUNTRIES.has(raw.country), "invalid destination");
  check(typeof raw.providerWorldId === "string" && UUID.test(raw.providerWorldId), "invalid world ID");
  check(typeof raw.colliderSha256 === "string" && SHA256.test(raw.colliderSha256),
    "collider digest required");
  check(typeof raw.splatSha256 === "string" && SHA256.test(raw.splatSha256),
    "visual digest required");
  check(raw.coordinateFrame === "three-y-up-meters", "coordinate frame not aligned");
  check(Number.isInteger(raw.width) && raw.width >= 2 && raw.width <= 256, "invalid grid width");
  check(Number.isInteger(raw.height) && raw.height >= 2 && raw.height <= 256, "invalid grid height");
  check(raw.width * raw.height <= MAX_CELLS, "grid too large");
  check(finite(raw.cellSize, 0.25, 3), "invalid cell size");
  check(finite(raw.originX, -2000, 2000) && finite(raw.originZ, -2000, 2000), "invalid origin");
  check(Array.isArray(raw.floorY) && raw.floorY.length === raw.height, "floor rows required");

  const floor = [];
  for (const row of raw.floorY) {
    check(Array.isArray(row) && row.length === raw.width, "invalid floor row");
    for (const value of row) {
      // null means solid, steep, void, unverified or otherwise unsafe.
      check(value === null || finite(value, -500, 500), "invalid floor height");
      floor.push(value);
    }
  }

  const idx = (x, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return -1;
    const col = Math.floor((x - raw.originX) / raw.cellSize);
    const row = Math.floor((z - raw.originZ) / raw.cellSize);
    return row < 0 || row >= raw.height || col < 0 || col >= raw.width
      ? -1 : row * raw.width + col;
  };

  const floorAt = (x, z) => {
    const i = idx(x, z);
    return i < 0 ? null : floor[i];
  };

  function safeFootprint(x, z, previousY = null) {
    const points = [[0, 0], [-RADIUS, 0], [RADIUS, 0],
      [0, -RADIUS], [0, RADIUS], [-RADIUS, -RADIUS],
      [RADIUS, -RADIUS], [-RADIUS, RADIUS], [RADIUS, RADIUS]];
    const levels = points.map(([dx, dz]) => floorAt(x + dx, z + dz));
    if (levels.some(v => v === null)) return null;
    // A person cannot stand astride a sudden drop/step or walk onto it.
    if (Math.max(...levels) - Math.min(...levels) > STEP_HEIGHT) return null;
    const centerY = levels[0];
    if (previousY !== null && Math.abs(centerY - previousY) > STEP_HEIGHT) return null;
    return centerY;
  }

  function validPoint(point) {
    if (!point || !finite(point.x, -2000, 2000) ||
        !finite(point.z, -2000, 2000) ||
        !finite(point.y, -500, 500) ||
        !finite(point.yaw, -Math.PI * 2, Math.PI * 2)) return false;
    const ground = safeFootprint(point.x, point.z);
    return ground !== null && Math.abs(point.y - ground) <= 0.02;
  }

  function trace(from, targetX, targetZ) {
    let point = { x: from.x, z: from.z, y: from.y };
    const deltaX = targetX - point.x, deltaZ = targetZ - point.z;
    const steps = Math.ceil(Math.hypot(deltaX, deltaZ) / Math.min(RADIUS, raw.cellSize / 3));
    if (!Number.isFinite(steps) || steps > 256) return point;
    for (let i = 0; i < steps; i += 1) {
      const x = point.x + deltaX / steps, z = point.z + deltaZ / steps;
      const y = safeFootprint(x, z, point.y);
      if (y === null) break;
      point = { x, z, y };
    }
    return point;
  }

  function step(position, input, dt) {
    check(validPoint(position), "invalid starting position");
    check(input && typeof input === "object", "input required");
    const duration = finite(dt, 0, 0.05) ? dt : 0;
    const yaw = finite(input.yaw, -Math.PI * 2, Math.PI * 2) ? input.yaw : position.yaw;
    const forward = Number(input.forward === true) - Number(input.backward === true);
    const side = Number(input.right === true) - Number(input.left === true);
    let dx = -Math.sin(yaw) * forward + Math.cos(yaw) * side;
    let dz = -Math.cos(yaw) * forward - Math.sin(yaw) * side;
    const length = Math.hypot(dx, dz);
    if (!length || !duration) return { ...position, yaw, moving: false };
    dx *= SPEED * duration / length;
    dz *= SPEED * duration / length;
    // Axis-separated movement permits sliding along a safe obstacle edge.
    let next = trace({ ...position, y: floorAt(position.x, position.z) }, position.x + dx, position.z);
    next = trace(next, next.x, next.z + dz);
    const moved = Math.hypot(next.x - position.x, next.z - position.z) > 1e-6;
    return { ...next, yaw, moving: moved };
  }

  function validServerMove(next, previous, elapsed) {
    if (!validPoint(previous) || !validPoint(next) || !finite(elapsed, 0, 30)) return false;
    const fromY = safeFootprint(previous.x, previous.z);
    const toY = safeFootprint(next.x, next.z, fromY);
    if (toY === null || Math.abs(next.y - toY) > 0.02) return false;
    const distance = Math.hypot(next.x - previous.x, next.z - previous.z);
    if (distance > SPEED * Math.min(elapsed, 0.5) + 0.45) return false;
    // A valid endpoint is not sufficient: prevent crossing blocked cells.
    const traced = trace({ x: previous.x, z: previous.z, y: fromY }, next.x, next.z);
    return Math.hypot(traced.x - next.x, traced.z - next.z) < 0.02;
  }

  check(raw.spawn && validPoint(raw.spawn), "spawn is not safe");
  const spawnY = safeFootprint(raw.spawn.x, raw.spawn.z);
  check(finite(raw.spawn.y, -500, 500) && Math.abs(raw.spawn.y - spawnY) < 0.02,
    "spawn is not grounded");

  return Object.freeze({
    schemaVersion: VERSION,
    country: raw.country,
    providerWorldId: raw.providerWorldId,
    colliderSha256: raw.colliderSha256,
    splatSha256: raw.splatSha256,
    spawn: Object.freeze({ x: raw.spawn.x, y: spawnY, z: raw.spawn.z, yaw: raw.spawn.yaw }),
    floorAt,
    validPoint,
    step,
    validServerMove,
  });
}
module.exports = { makeNavigation, VERSION, SPEED, RADIUS, STEP_HEIGHT };
