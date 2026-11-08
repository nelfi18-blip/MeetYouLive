import rules from "../../../backend/src/lib/vcrWorldRules.cjs";

// A light, non-WebGL presentation adapter for the existing authoritative VCR
// presence protocol. Coordinates remain virtual, never the user's GPS.
export function createPhotoWorldAdapter({ onZoneChange } = {}) {
  let country = "us";
  let position = { x: 0, z: 0, yaw: 0 };
  return {
    setPeers() {}, // Presence is displayed from the filtered onPeers callback.
    stopMoving() {},
    setOutfit() {},
    getPosition() { return { ...position }; },
    setPosition(next) {
      if (!next || !rules.walkable(country, next.x, next.z)) return false;
      position = { x: next.x, z: next.z, yaw: Number.isFinite(next.yaw) ? next.yaw : 0 };
      return true;
    },
    travelCountry(nextCountry) {
      if (!Object.hasOwn(rules.DESTINATIONS, nextCountry)) return false;
      country = nextCountry;
      position = { x: 0, z: 0, yaw: 0 };
      onZoneChange?.("central");
      return true;
    },
    teleport(zone) {
      if (!Object.hasOwn(rules.zones, zone)) return false;
      position = { ...rules.zones[zone], yaw: 0 };
      onZoneChange?.(zone);
      return true;
    },
    inspect() { return { country, position: { ...position } }; },
  };
}
