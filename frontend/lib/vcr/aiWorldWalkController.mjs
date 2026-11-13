import { AiWorldAssetError } from "./aiWorldAssets.mjs";

/**
 * Client-side input for an operator-approved, server-authoritative AI world.
 * Navigation is the same validated grid returned by the isolated World Test
 * backend. No procedural collision fallback, fake avatars, or generation API.
 */
export function createAiWorldWalkController({ descriptor, navigation }) {
  if (!descriptor?.generatedByAi || descriptor.aiContentLabelRequired !== true ||
      descriptor.interactionReady !== false ||
      navigation?.country !== descriptor.country ||
      navigation?.providerWorldId !== descriptor.providerWorldId ||
      navigation?.splatSha256?.toLowerCase() !== descriptor.splatSha256?.toLowerCase() ||
      navigation?.colliderSha256?.toLowerCase() !== descriptor.colliderSha256?.toLowerCase() ||
      typeof navigation.step !== "function" ||
      typeof navigation.validPoint !== "function" ||
      !navigation.validPoint(navigation.spawn)) {
    throw new AiWorldAssetError("World AI movement requires matching approved server navigation");
  }

  let position = { ...navigation.spawn };
  let enabled = false;
  let disposed = false;
  const input = { forward: false, backward: false, left: false, right: false };
  let peers = [];

  function stopMoving() {
    for (const key of Object.keys(input)) input[key] = false;
  }

  return Object.freeze({
    setInputEnabled(value) {
      enabled = !disposed && value === true;
      if (!enabled) stopMoving();
    },
    setDirection(direction, pressed) {
      const name = direction === "back" ? "backward" : direction;
      if (Object.hasOwn(input, name)) input[name] = enabled && pressed === true;
    },
    stopMoving,
    setPosition(next) {
      if (disposed || !navigation.validPoint(next)) return false;
      position = { x: next.x, y: next.y, z: next.z, yaw: next.yaw };
      stopMoving();
      return true;
    },
    setViewYaw(yaw) {
      if (disposed || !Number.isFinite(yaw)) return;
      position = { ...position, yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)) };
    },
    advance(dt) {
      if (disposed || !enabled) return { ...position, moving: false };
      position = navigation.step(position, { ...input, yaw: position.yaw }, dt);
      return { ...position };
    },
    getPosition() {
      return { x: position.x, y: position.y, z: position.z, yaw: position.yaw };
    },
    setPeers(rows) {
      // A verified socket snapshot can contain people, not synthesized bodies.
      peers = Array.isArray(rows) ? rows.filter((peer) =>
        peer && typeof peer.userId === "string" && navigation.validPoint(peer.position)) : [];
    },
    getPeers() { return [...peers]; },
    setOutfit() {}, // Never claim AI changed a person's clothing or appearance.
    travelCountry() { return false; }, // Each destination needs its own signed assets.
    teleport() { return false; }, // Never teleport into the old procedural districts.
    dispose() { disposed = true; enabled = false; stopMoving(); peers = []; },
  });
}
