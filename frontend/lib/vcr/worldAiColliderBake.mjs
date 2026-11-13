import navigation from "../../../backend/src/lib/worldAiNavigation.cjs";

/**
 * Offline-only conservative navigation bake from a REAL, inspected GLB
 * collider already transformed to Three.js Y-up meters.
 *
 * Inputs (world ID, SPZ/GLB hashes and colliderRoot) must come from one
 * operator-approved asset pair. This function never fetches, generates,
 * purchases, or publishes anything. A grid is NOT an authorization to join
 * a shared World: the backend must pin and verify the identical manifest.
 */
export function bakeWorldAiNavigation({
  THREE, colliderRoot, providerWorldId, country, colliderSha256, splatSha256,
  originX, originZ, width, height, cellSize,
  expectedFloorY = 0, allowedFloorDeviation = 2,
  spawnX = 0, spawnZ = 0, spawnYaw = 0,
}) {
  if (!THREE?.Raycaster || !THREE?.Vector3 || !THREE?.Matrix3 ||
      !colliderRoot?.traverse || !colliderRoot?.updateMatrixWorld) {
    throw new Error("World AI bake: real transformed GLB collider and Three.js required");
  }
  if (!Number.isInteger(width) || width < 2 || width > 128 ||
      !Number.isInteger(height) || height < 2 || height > 128 ||
      width * height > 16384 ||
      typeof cellSize !== "number" || !Number.isFinite(cellSize) ||
      cellSize < 0.25 || cellSize > 1 ||
      ![originX, originZ, expectedFloorY, allowedFloorDeviation, spawnX, spawnZ, spawnYaw]
        .every(Number.isFinite) ||
      expectedFloorY < -100 || expectedFloorY > 100 ||
      allowedFloorDeviation < 0.25 || allowedFloorDeviation > 10) {
    throw new Error("World AI bake: invalid conservative grid configuration");
  }

  colliderRoot.updateMatrixWorld(true);
  const surfaces = [];
  colliderRoot.traverse((node) => {
    if (node?.isMesh && node.geometry && node.visible !== false) surfaces.push(node);
  });
  if (!surfaces.length) throw new Error("World AI bake: collider has no visible triangle meshes");

  const ray = new THREE.Raycaster();
  const origin = new THREE.Vector3();
  const down = new THREE.Vector3(0, -1, 0);
  const normals = new THREE.Matrix3();
  const normal = new THREE.Vector3();
  const maxY = expectedFloorY + allowedFloorDeviation + 2;
  const minY = expectedFloorY - allowedFloorDeviation;
  const maxSlopeDot = Math.cos(Math.PI * 35 / 180);
  const margin = cellSize / 2 + navigation.RADIUS;
  const cardinal = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)];

  function sampleFloor(x, z) {
    origin.set(x, maxY, z);
    ray.set(origin, down);
    ray.far = maxY - minY + 1;
    const hits = ray.intersectObjects(surfaces, false);
    const ground = hits.find((hit) => {
      if (!hit.face || hit.point.y < minY || hit.point.y > expectedFloorY + allowedFloorDeviation) {
        return false;
      }
      normals.getNormalMatrix(hit.object.matrixWorld);
      normal.copy(hit.face.normal).applyMatrix3(normals).normalize();
      return normal.y >= maxSlopeDot;
    });
    if (!ground) return null;
    // Every cell is inflated by the visitor radius plus half the grid
    // resolution so a wall between two cell centers blocks BOTH cells.
    for (const direction of cardinal) {
      origin.set(x, ground.point.y + 1.1, z);
      ray.set(origin, direction);
      ray.far = margin;
      const obstacle = ray.intersectObjects(surfaces, false)
        .some(hit => hit.distance > 0.001 && hit.distance <= margin);
      if (obstacle) return null;
    }
    return Math.round(ground.point.y * 1000) / 1000;
  }

  const raw = [];
  for (let row = 0; row < height; row += 1) {
    const cells = [];
    for (let col = 0; col < width; col += 1) {
      const x = originX + (col + .5) * cellSize;
      const z = originZ + (row + .5) * cellSize;
      cells.push(sampleFloor(x, z));
    }
    raw.push(cells);
  }

  const spawnCol = Math.floor((spawnX - originX) / cellSize);
  const spawnRow = Math.floor((spawnZ - originZ) / cellSize);
  if (spawnCol < 0 || spawnCol >= width || spawnRow < 0 || spawnRow >= height ||
      raw[spawnRow][spawnCol] === null) {
    throw new Error("World AI bake: reviewed spawn has no safe collider floor");
  }
  // Reject disconnected roofs/platforms and edges; keep only the connected
  // floor reachable from the explicit reviewed start.
  const queue = [[spawnRow, spawnCol]];
  const seen = new Set([spawnRow * width + spawnCol]);
  for (let i = 0; i < queue.length; i += 1) {
    const [row, col] = queue[i];
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nr = row + dr, nc = col + dc;
      if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue;
      const index = nr * width + nc;
      if (seen.has(index) || raw[nr][nc] === null ||
          Math.abs(raw[nr][nc] - raw[row][col]) > navigation.STEP_HEIGHT) continue;
      seen.add(index);
      queue.push([nr, nc]);
    }
  }
  const floors = raw.map((row, r) => row.map((value, c) =>
    seen.has(r * width + c) ? value : null));
  const spawn = {
    x: originX + (spawnCol + .5) * cellSize,
    y: floors[spawnRow][spawnCol],
    z: originZ + (spawnRow + .5) * cellSize,
    yaw: spawnYaw,
  };
  const manifest = {
    schemaVersion: navigation.VERSION, providerWorldId, country,
    colliderSha256, splatSha256, coordinateFrame: "three-y-up-meters",
    width, height, cellSize, originX, originZ, floorY: floors, spawn,
  };
  // Re-use the EXACT shared movement validation rules. If the spawn is
  // ungrounded or within an unsafe radius, fail the import entirely.
  navigation.makeNavigation(manifest);
  return manifest;
}
