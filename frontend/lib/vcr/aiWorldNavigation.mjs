import { AiWorldAssetError } from "./aiWorldAssets.mjs";

const WALK_SPEED_MPS = 2.8;
const MAX_STEP_SECONDS = 0.05;
const MAX_RISE_METERS = 0.35;
const MAX_DROP_METERS = 0.45;
const BODY_RADIUS = 0.32;

/**
 * Local first-person inspection movement only. It does NOT send positions to
 * Socket.IO or bypass the backend's current AABB authorization. Multiplayer
 * walking must remain disabled until a server-vetted navigation map matches
 * this exact generated GLB collider.
 */
export function advanceAiWorldPosition(position, input, dt, probe) {
  if (!position || ![position.x, position.y, position.z].every(Number.isFinite) ||
      typeof probe !== "function" ||
      !Number.isFinite(dt) || dt < 0 || dt > 0.25) {
    throw new AiWorldAssetError("Invalid AI-world navigation input");
  }
  const yaw = Number.isFinite(input?.yaw) ? input.yaw : 0;
  const forward = Number(!!input?.forward) - Number(!!input?.backward);
  const right = Number(!!input?.right) - Number(!!input?.left);
  let dx = -Math.sin(yaw) * forward + Math.cos(yaw) * right;
  let dz = -Math.cos(yaw) * forward - Math.sin(yaw) * right;
  const size = Math.hypot(dx, dz);
  if (!size || dt === 0) return { ...position, yaw, moving: false };
  const step = WALK_SPEED_MPS * Math.min(dt, MAX_STEP_SECONDS);
  dx = dx / size * step;
  dz = dz / size * step;

  const attempt = (x, z, from) => {
    if (Math.hypot(x - from.x, z - from.z) < 1e-6) return null;
    if (Math.abs(x) > 80 || Math.abs(z) > 80) return null;
    const result = probe(from, { x, z }, BODY_RADIUS);
    if (!result?.ok || !Number.isFinite(result.groundY)) return null;
    const difference = result.groundY - from.y;
    if (difference > MAX_RISE_METERS || difference < -MAX_DROP_METERS) return null;
    return { x, y: result.groundY, z };
  };

  const full = attempt(position.x + dx, position.z + dz, position);
  const alongX = full || attempt(position.x + dx, position.z, position);
  const alongZ = full || alongX || attempt(position.x, position.z + dz, position);
  const next = full || alongX || alongZ || position;
  return { ...next, yaw, moving: next !== position };
}

/**
 * Query the provider GLB, not the old decorative Three.js city geometry.
 * The caller must have loaded and validated the collider with matching
 * world scale. Missing ground or an ambiguous wall fails closed.
 */
export function createMarbleRaycastProbe(THREE, colliderRoot) {
  if (typeof THREE?.Raycaster !== "function" ||
      typeof THREE?.Vector3 !== "function" ||
      !colliderRoot?.traverse) {
    throw new AiWorldAssetError("Generated world collision geometry is not ready");
  }
  colliderRoot.updateMatrixWorld?.(true);
  const ray = new THREE.Raycaster();
  const unit = (x, y, z) => new THREE.Vector3(x, y, z);

  return (from, candidate, radius = BODY_RADIUS) => {
    if (!from || !candidate ||
        ![from.x, from.y, from.z, candidate.x, candidate.z, radius].every(Number.isFinite) ||
        radius < 0.2 || radius > 0.6) return { ok: false };

    const dx = candidate.x - from.x, dz = candidate.z - from.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 0.3) return { ok: false };

    if (distance > 1e-6) {
      for (const height of [0.35, 1.2]) {
        ray.set(unit(from.x, from.y + height, from.z),
          unit(dx / distance, 0, dz / distance));
        ray.near = 0;
        ray.far = distance + radius;
        if (ray.intersectObject(colliderRoot, true).some((hit) =>
          hit.distance >= 0 && hit.distance <= ray.far)) return { ok: false };
      }
    }

    ray.set(unit(candidate.x, from.y + 1.35, candidate.z), unit(0, -1, 0));
    ray.near = 0;
    ray.far = 2.25;
    const floors = ray.intersectObject(colliderRoot, true);
    const candidateFloor = floors.find((hit) => {
      const face = hit.face?.normal;
      if (!face || !hit.object?.matrixWorld || !hit.point) return false;
      const normal = face.clone().transformDirection(hit.object.matrixWorld);
      return normal.y > 0.6;
    });
    if (!candidateFloor) return { ok: false };
    return { ok: true, groundY: candidateFloor.point.y };
  };
}
