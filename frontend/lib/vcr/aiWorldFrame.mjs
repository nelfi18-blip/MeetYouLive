import { AiWorldAssetError } from "./aiWorldAssets.mjs";

/**
 * Marble v1 raw/OpenCV frame -> Three.js metric/right-up-back frame.
 * Splats and their companion GLB collider MUST share this transform.
 * Source: https://docs.worldlabs.ai/api/rendering-spz
 *
 * x_world = s * x_raw
 * y_world = groundOffset - s * y_raw
 * z_world = -s * z_raw
 */
export function marbleToMeters(point, descriptor) {
  const { worldSpatialScale: s, groundPlaneOffset: g } = descriptor || {};
  if (!Array.isArray(point) || point.length !== 3 ||
      !point.every((n) => typeof n === "number" && Number.isFinite(n)) ||
      !Number.isFinite(s) || s <= 0 || !Number.isFinite(g)) {
    throw new AiWorldAssetError("Invalid Marble coordinate frame");
  }
  return [s * point[0], g - s * point[1], -s * point[2]];
}

export function metersToMarble(point, descriptor) {
  const { worldSpatialScale: s, groundPlaneOffset: g } = descriptor || {};
  if (!Array.isArray(point) || point.length !== 3 ||
      !point.every((n) => typeof n === "number" && Number.isFinite(n)) ||
      !Number.isFinite(s) || s <= 0 || !Number.isFinite(g)) {
    throw new AiWorldAssetError("Invalid Marble coordinate frame");
  }
  return [point[0] / s, (g - point[1]) / s, -point[2] / s];
}

export function createMarbleWorldFrame(THREE, descriptor) {
  const scale = descriptor?.worldSpatialScale;
  const offset = descriptor?.groundPlaneOffset;
  if (typeof THREE?.Group !== "function" ||
      typeof scale !== "number" || !Number.isFinite(scale) || scale <= 0 ||
      typeof offset !== "number" || !Number.isFinite(offset)) {
    throw new AiWorldAssetError("Cannot mount uncalibrated Marble geometry");
  }
  const axis = new THREE.Group();
  const metric = new THREE.Group();
  axis.rotation.x = Math.PI;
  metric.position.y = -offset;
  metric.scale.setScalar(scale);
  axis.add(metric);
  return { axis, metric };
}
