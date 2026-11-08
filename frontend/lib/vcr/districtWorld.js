import rules from "../../../backend/src/lib/vcrWorldRules.cjs";
import { buildDestination } from "./destinationScene.js";
import { createAvatar, VCR_OUTFITS } from "./avatar.js";
export { VCR_OUTFITS };
export const VCR_DISTRICTS = Object.freeze(Object.entries(rules.zones).map(([id, position]) => ({ id, ...position })));

export function isWalkable(x, z, buildings) {
  return Number.isFinite(x) && Number.isFinite(z) && Math.abs(x) <= rules.LIMIT && Math.abs(z) <= rules.LIMIT &&
    !buildings.some((b) => Math.abs(x - b.x) < b.w / 2 + 0.85 && Math.abs(z - b.z) < b.d / 2 + 0.85);
}
export function cameraOrbit(yaw, pitch, distance = 8) {
  const safePitch = Math.max(0.1, Math.min(0.85, pitch));
  return { x: Math.sin(yaw) * distance * Math.cos(safePitch), y: Math.sin(safePitch) * distance,
    z: Math.cos(yaw) * distance * Math.cos(safePitch) };
}

export function createVcrDistrict(THREE, canvas, { onDistrictChange, onCountryChange, onContextLost, firstPerson = false } = {}) {
  const mobile = window.innerWidth < 768;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: "default" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.2 : 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = !mobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(mobile ? 68 : 58, 1, 0.1, 240);
  const sun = new THREE.DirectionalLight(0xffdbba, 2.6);
  sun.position.set(-35, 65, 20); sun.castShadow = !mobile;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40 });
  sun.shadow.normalBias = 0.05;
  scene.add(new THREE.HemisphereLight(0xe1efff, 0x8e7352, 2.4), sun, sun.target);
  const avatar = createAvatar(THREE); scene.add(avatar.root);
  // The walkable pilot can use a first-person camera so it does not invent a
  // body shape or claim the original prototype figure is the member likeness.
  avatar.root.visible = !firstPerson;
  const peers = new Map();
  let country = "us", environment = buildDestination(THREE, scene, country, mobile);
  let position = { x: 0, z: 0, yaw: Math.PI }, yaw = 0, pitch = 0.38, pointer = null;
  let lastX = 0, lastY = 0, disposed = false, lost = false, raf = 0, previous = performance.now(), slowFrames = 0;
  const keys = { forward: false, backward: false, left: false, right: false };
  const target = new THREE.Vector3(), desired = new THREE.Vector3(), direction = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  function stopMoving() { Object.keys(keys).forEach((key) => { keys[key] = false; }); }
  function setDirection(key, enabled) {
    const name = key === "back" ? "backward" : key;
    if (Object.hasOwn(keys, name)) keys[name] = Boolean(enabled);
  }
  function setPosition(next) {
    if (!next || !rules.walkable(country, next.x, next.z)) return false;
    position = { x: next.x, z: next.z, yaw: Number.isFinite(next.yaw) ? next.yaw : 0 };
    avatar.root.position.set(position.x, 0.03, position.z); stopMoving(); return true;
  }
  function teleport(id) {
    if (!Object.hasOwn(rules.zones, id)) return false;
    setPosition({ ...rules.zones[id], yaw: 0 }); onDistrictChange?.(id); return true;
  }
  function setPeers(rows) {
    const ids = new Set(rows.map((p) => p.userId));
    for (const [id, peer] of peers) if (!ids.has(id)) {
      peer.avatar.dispose(); peer.label.material.map.dispose(); peer.label.material.dispose(); peers.delete(id);
    }
    for (const entry of rows) {
      if (!rules.walkable(country, entry.position?.x, entry.position?.z)) continue;
      let peer = peers.get(entry.userId);
      if (!peer) {
        const character = createAvatar(THREE, entry.outfit); scene.add(character.root);
        character.root.position.set(entry.position.x, 0.03, entry.position.z);
        const labelCanvas = document.createElement("canvas"); labelCanvas.width = 256; labelCanvas.height = 48;
        const ctx = labelCanvas.getContext("2d"); ctx.fillStyle = "rgba(12,20,37,.85)"; ctx.fillRect(0, 0, 256, 48);
        ctx.fillStyle = "#fff"; ctx.font = "24px sans-serif"; ctx.textAlign = "center";
        ctx.fillText(String(entry.name || "").slice(0, 24), 128, 33, 240);
        const texture = new THREE.CanvasTexture(labelCanvas);
        const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
        label.position.y = 2.8; label.scale.set(2.8, 0.53, 1); character.root.add(label);
        peer = { avatar: character, label, target: entry.position, last: entry.position, movingUntil: 0 };
        peers.set(entry.userId, peer);
      }
      if (Math.hypot(entry.position.x - peer.last.x, entry.position.z - peer.last.z) > 0.01) peer.movingUntil = performance.now() + 300;
      peer.target = entry.position; peer.last = entry.position; peer.avatar.setOutfit(entry.outfit);
    }
  }
  function travelCountry(id) {
    if (!Object.hasOwn(rules.DESTINATIONS, id)) return false;
    setPeers([]); environment.dispose(); country = id;
    environment = buildDestination(THREE, scene, id, mobile); yaw = 0;
    sun.intensity = id === "jp" ? 0.65 : 2.6;
    setPosition({ x: 0, z: 0, yaw: 0 }); onCountryChange?.(id);
    camera.position.set(0, 5, 10); return true;
  }
  const keyDirection = (event) => ({ w: "forward", arrowup: "forward", s: "backward", arrowdown: "backward",
    a: "left", arrowleft: "left", d: "right", arrowright: "right" })[event.key.toLowerCase()];
  function onKeyDown(event) {
    if (event.target?.matches?.("input, textarea, select, [contenteditable=true]")) return;
    const key = keyDirection(event);
    if (key && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); setDirection(key, true); }
  }
  function onKeyUp(event) { const key = keyDirection(event); if (key) setDirection(key, false); }
  function onPointerDown(event) { pointer = event.pointerId; lastX = event.clientX; lastY = event.clientY; canvas.setPointerCapture?.(pointer); }
  function onPointerMove(event) {
    if (pointer !== event.pointerId) return;
    yaw = (yaw - (event.clientX - lastX) * 0.006) % (Math.PI * 2);
    pitch = Math.max(0.1, Math.min(0.85, pitch + (event.clientY - lastY) * 0.004));
    lastX = event.clientX; lastY = event.clientY;
  }
  function onPointerUp(event) { if (pointer === event.pointerId) pointer = null; }
  function contextLost(event) { event.preventDefault(); lost = true; stopMoving(); onContextLost?.(); }
  function visibility() { if (document.hidden) stopMoving(); }
  function resize() {
    renderer.setSize(Math.max(canvas.clientWidth, 1), Math.max(canvas.clientHeight, 1), false);
    camera.aspect = Math.max(canvas.clientWidth, 1) / Math.max(canvas.clientHeight, 1); camera.updateProjectionMatrix();
  }
  function frame(now) {
    if (disposed || lost) return;
    raf = window.requestAnimationFrame(frame);
    const elapsed = Math.max(0, (now - previous) / 1000), dt = Math.min(elapsed, 0.05); previous = now;
    if (document.hidden) return;
    // Adaptive resolution reduces fill-rate pressure without inventing FPS claims.
    if (elapsed > 0.045 && ++slowFrames === 45) { renderer.setPixelRatio(0.8); resize(); }
    position = rules.step(country, position, { ...keys, yaw }, dt);
    avatar.root.position.set(position.x, 0.03, position.z); avatar.root.rotation.y = position.yaw;
    avatar.animate(now, position.moving);
    for (const peer of peers.values()) {
      const root = peer.avatar.root, alpha = Math.min(1, dt * 12);
      root.position.x += (peer.target.x - root.position.x) * alpha; root.position.z += (peer.target.z - root.position.z) * alpha;
      const angle = Math.atan2(Math.sin(peer.target.yaw - root.rotation.y), Math.cos(peer.target.yaw - root.rotation.y));
      root.rotation.y += angle * alpha; peer.avatar.animate(now, now < peer.movingUntil);
    }
    if (firstPerson) {
      // Camera position changes with REAL authoritative movement on every
      // frame. Looking around cannot advance the avatar or bypass colliders.
      const eyeHeight = 1.7;
      const tilt = (pitch - 0.38) * 1.45;
      const reach = Math.cos(tilt) * 12;
      camera.position.set(position.x, eyeHeight, position.z);
      camera.lookAt(position.x - Math.sin(yaw) * reach,
        eyeHeight + Math.sin(tilt) * 12,
        position.z - Math.cos(yaw) * reach);
    } else {
      target.set(position.x, 1.7, position.z);
      const offset = cameraOrbit(yaw, pitch); desired.set(offset.x, offset.y, offset.z).add(target);
      direction.copy(desired).sub(target); ray.set(target, direction.clone().normalize()); ray.far = direction.length();
      const obstruction = ray.intersectObjects(environment.root.children, true).find((hit) => hit.distance > 0.5);
      if (obstruction) desired.copy(target).addScaledVector(direction.normalize(), Math.max(1.2, obstruction.distance - 0.35));
      camera.position.lerp(desired, Math.min(1, dt * 7)); camera.lookAt(target);
    }
    sun.position.set(position.x - 35, 65, position.z + 20); sun.target.position.set(position.x, 0, position.z);
    renderer.render(scene, camera);
  }
  window.addEventListener("keydown", onKeyDown); window.addEventListener("keyup", onKeyUp); window.addEventListener("blur", stopMoving);
  document.addEventListener("visibilitychange", visibility);
  canvas.addEventListener("pointerdown", onPointerDown); canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp); canvas.addEventListener("pointercancel", onPointerUp); canvas.addEventListener("lostpointercapture", onPointerUp);
  canvas.addEventListener("webglcontextlost", contextLost);
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null; observer?.observe(canvas);
  window.addEventListener("resize", resize); resize(); camera.position.set(0, 5, 10); frame(performance.now());
  return { setDirection, stopMoving, setOutfit: avatar.setOutfit, teleport, travelCountry, setPosition, setPeers,
    getPosition: () => ({ x: position.x, z: position.z, yaw: position.yaw }),
    inspect: () => ({ country, position: { ...position }, camera: camera.position.toArray(), peers: peers.size, lost, peerPositions: Object.fromEntries([...peers].map(([id, peer]) => [id, { x: peer.avatar.root.position.x, z: peer.avatar.root.position.z }])), drawCalls: renderer.info.render.calls }),
    dispose() {
      if (disposed) return; disposed = true; stopMoving(); window.cancelAnimationFrame(raf); observer?.disconnect();
      window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); window.removeEventListener("blur", stopMoving);
      window.removeEventListener("resize", resize); document.removeEventListener("visibilitychange", visibility);
      canvas.removeEventListener("pointerdown", onPointerDown); canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp); canvas.removeEventListener("pointercancel", onPointerUp); canvas.removeEventListener("lostpointercapture", onPointerUp);
      canvas.removeEventListener("webglcontextlost", contextLost); setPeers([]); avatar.dispose(); environment.dispose();
      sun.shadow.map?.dispose(); renderer.dispose();
    },
  };
}
