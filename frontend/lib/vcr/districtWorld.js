// A self-contained, original Three.js urban district for the first VCR phase.
// This is a solo explorable 3D scene, NOT multiplayer, AI-generated or an Agora room.
import { VCR_COUNTRIES, findVcrCountry } from "./countries.js";

export const VCR_DISTRICTS = Object.freeze([
  { id: "central", x: 0, z: 0 },
  { id: "neon", x: 44, z: -22 },
  { id: "coast", x: -88, z: 44 },
  { id: "park", x: 0, z: 88 },
]);

export const VCR_OUTFITS = Object.freeze({
  violet: 0x985cff,
  cyan: 0x16c8da,
  pink: 0xef58a9,
});

const ROAD_LINES = [-88, -44, 0, 44, 88];
const BLOCK_CENTERS = [-66, -22, 22, 66];
const MAP_LIMIT = 109;

export function isWalkable(x, z, buildings) {
  if (!Number.isFinite(x) || !Number.isFinite(z) ||
      Math.abs(x) > MAP_LIMIT || Math.abs(z) > MAP_LIMIT) return false;
  return !buildings.some((b) => Math.abs(x - b.x) < b.w / 2 + 0.85 &&
    Math.abs(z - b.z) < b.d / 2 + 0.85);
}

function randomFrom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function makeBuildingTexture(THREE, seed, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const rand = randomFrom(seed);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, 512);
  // Original procedural stucco, mullions and illuminated window panes.
  for (let row = 0; row < 18; row += 1) {
    for (let col = 0; col < 7; col += 1) {
      const x = 12 + col * 35;
      const y = 14 + row * 27;
      ctx.fillStyle = "#222934";
      ctx.fillRect(x - 2, y - 3, 27, 20);
      const lit = rand() > 0.43;
      ctx.fillStyle = lit ? (rand() > 0.65 ? "#fbd6a1" : "#b0d4e3") : "#253746";
      ctx.fillRect(x, y, 23, 15);
      ctx.fillStyle = lit ? "rgba(255,255,255,.25)" : "rgba(122,161,178,.14)";
      ctx.fillRect(x + 2, y + 2, 5, 11);
      ctx.fillStyle = color;
      ctx.fillRect(x + 10, y, 2, 15);
    }
  }
  for (let y = 0; y < 512; y += 54) {
    ctx.fillStyle = "rgba(12,17,33,.17)";
    ctx.fillRect(0, y, 256, 4);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
}

function makeSignTexture(THREE, caption) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#160f27";
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = "#43d5f4";
  ctx.lineWidth = 6;
  ctx.strokeRect(7, 7, 498, 114);
  ctx.fillStyle = "#c7f7ff";
  ctx.font = "bold 62px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(caption, 256, 84);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createVcrDistrict(THREE, canvas, { onDistrictChange, onCountryChange } = {}) {
  if (!canvas) throw new Error("VCR canvas missing");
  const mobile = window.innerWidth < 768;
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: !mobile, alpha: false, powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.7));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8ba9be);
  scene.fog = new THREE.FogExp2(0x9aabc1, 0.0061);
  const camera = new THREE.PerspectiveCamera(65, 1, 0.15, 310);
  const hemi = new THREE.HemisphereLight(0xdcefff, 0x77593d, 2.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc99b, 2.5);
  sun.position.set(-45, 90, -35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -35;
  sun.shadow.camera.right = 35;
  sun.shadow.camera.top = 35;
  sun.shadow.camera.bottom = -35;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  const mat = (color, more = {}) => new THREE.MeshStandardMaterial({
    color, roughness: 0.85, metalness: 0.05, ...more,
  });
  const materials = {
    ground: mat(0xa2a28a), asphalt: mat(0x333b44), sidewalk: mat(0x9b9b96),
    paving: mat(0xb6a99b), stripe: mat(0xd1c8a2), trunk: mat(0x665038),
    leaf: mat(0x376a4d, { side: THREE.DoubleSide }),
    grass: mat(0x557c49), water: mat(0x438b9c, { metalness: 0.35, roughness: 0.2 }),
    dark: mat(0x222b37), roof: mat(0x434650), lamp: mat(0xf9dfb5, {
      emissive: 0xffc888, emissiveIntensity: 1.9,
    }),
  };
  const solid = [];
  function box(w, h, d, x, y, z, material, parent = scene) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function sphere(radius, x, y, z, material, parent = scene, segments = 10) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, 8), material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  // Continuous city ground, roads, sidewalks, sidewalks and lane markers.
  box(238, 0.16, 238, 0, -0.16, 0, materials.ground);
  for (const a of ROAD_LINES) {
    box(222, 0.07, 13, 0, -0.015, a, materials.asphalt);
    box(13, 0.07, 222, a, -0.012, 0, materials.asphalt);
    for (let p = -102; p < 108; p += 13) {
      if (ROAD_LINES.some((crossing) => Math.abs(p - crossing) < 9)) continue;
      box(5.5, 0.014, 0.16, p, 0.032, a, materials.stripe);
      box(0.16, 0.014, 5.5, a, 0.036, p, materials.stripe);
    }
  }
  const rand = randomFrom(780917);
  const palettes = ["#687e8a", "#a18b80", "#8891a1", "#7f8492", "#afa49a", "#887f7b"];
  const facades = [];
  for (let i = 0; i < 9; i += 1) {
    facades.push(mat(0xffffff, { map: makeBuildingTexture(THREE, i * 71 + 900, palettes[i % palettes.length]) }));
  }

  // Public plaza, landscaped park and high-rises. No fake online users.
  for (const x of BLOCK_CENTERS) for (const z of BLOCK_CENTERS) {
    box(30, 0.35, 30, x, 0.02, z, materials.sidewalk);
    if (x === 22 && z === 22) {
      box(27, 0.12, 27, x, 0.25, z, materials.paving);
      const basin = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 0.65, 20), mat(0x8b969d));
      basin.position.set(x, 0.85, z);
      scene.add(basin);
      const pool = new THREE.Mesh(new THREE.CylinderGeometry(3.9, 3.9, 0.08, 20), materials.water);
      pool.position.set(x, 1.23, z);
      scene.add(pool);
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.72, 3.4, 10), materials.paving);
      pillar.position.set(x, 2.68, z);
      scene.add(pillar);
      continue;
    }
    if (x === -22 && z === 66) {
      box(28, 0.1, 28, x, 0.26, z, materials.grass);
      for (let i = 0; i < 7; i += 1) {
        const tx = x + (rand() - 0.5) * 20;
        const tz = z + (rand() - 0.5) * 20;
        palm(tx, tz);
      }
      box(3.8, 0.4, 1.0, x - 2, 0.62, z - 5, mat(0x765743));
      continue;
    }
    const height = 15 + rand() * 34;
    const width = 17 + rand() * 8;
    const depth = 17 + rand() * 8;
    const facade = facades[Math.floor(rand() * facades.length)];
    const sides = [facade, facade, materials.roof, materials.roof, facade, facade];
    const house = box(width, height, depth, x, height / 2 + 0.3, z, sides);
    house.castShadow = !mobile && Math.abs(x) < 50 && Math.abs(z) < 50;
    solid.push({ x, z, w: width, d: depth });
    // Roof structure and ground-level entrances.
    box(width * 0.24, 1.8, depth * 0.25, x + width * 0.2, height + 1.2, z, materials.roof);
    box(3.3, 3.5, 0.4, x, 2.12, z + depth / 2 + 0.25, materials.dark);
    if (x === 66 && z === -22) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 2.4),
        new THREE.MeshBasicMaterial({ map: makeSignTexture(THREE, "HORIZON"), transparent: false }));
      sign.position.set(x, 6.8, z + depth / 2 + 0.32);
      scene.add(sign);
    }
  }

  // Pacific-coast inspired shore: original colors/geometry, not game assets.
  box(58, 0.08, 222, -137, -0.055, 0, materials.water);
  box(12, 0.15, 222, -105, 0.03, 0, materials.paving);
  for (let z = -98; z <= 98; z += 20) palm(-103, z);
  function palm(x, z) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.42, 5.5, 7), materials.trunk);
    trunk.position.set(x, 2.9, z);
    trunk.rotation.z = 0.09;
    scene.add(trunk);
    for (let k = 0; k < 7; k += 1) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 7, 5), materials.leaf);
      leaf.position.set(x, 5.8, z);
      leaf.scale.set(2.8, 0.2, 0.43);
      leaf.rotation.y = k * Math.PI * 2 / 7;
      leaf.rotation.z = -0.24;
      scene.add(leaf);
    }
  }
  for (const a of [-88, 0, 88]) for (const z of [-110, -55, 0, 55, 110]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 6.4, 6), materials.dark);
    pole.position.set(a + 7, 3.25, z);
    scene.add(pole);
    sphere(0.45, a + 7, 6.55, z, materials.lamp);
  }


  // Country-inspired landmarks are original geometric sketches. They are
  // deliberately not described as real-world replicas or finished 3D assets.
  // A single visible landmark group limits GPU work on older phones.
  const countryLandmarks = new Map();
  for (const country of VCR_COUNTRIES) {
    const group = new THREE.Group();
    group.position.set(country.x + 9, 0, country.z + 9);
    scene.add(group);
    countryLandmarks.set(country.id, group);
    const accent = mat(country.landmark === "neon" ? 0xdd3fc7 : 0xbecbd1,
      { metalness: 0.25, roughness: 0.52 });
    if (country.landmark === "skyline") {
      for (const [offset, height] of [[-3.7, 12], [0, 21], [3.9, 15]]) {
        box(3.2, height, 3.8, offset, height / 2 + 0.25, 0, materials.dark, group);
        box(3.3, 0.6, 3.9, offset, height + 0.65, 0, accent, group);
      }
      box(0.26, 4.1, 0.26, 0, 23.7, 0, materials.lamp, group);
    } else if (country.landmark === "tower") {
      for (const offset of [-2.4, 2.4]) {
        const leg = box(0.75, 12, 0.75, offset, 6.5, 0, accent, group);
        leg.rotation.z = offset > 0 ? -0.22 : 0.22;
      }
      for (const level of [4.4, 8.5, 12.5]) {
        box(Math.max(1.8, 7 - level * 0.35), 0.8, 2.3, 0, level, 0, materials.dark, group);
      }
      box(0.42, 4.5, 0.42, 0, 15, 0, accent, group);
    } else if (country.landmark === "neon") {
      const red = mat(0xe55a65, { emissive: 0x8c1128, emissiveIntensity: 0.25 });
      box(1.15, 9, 1.4, -4.5, 4.8, 0, red, group);
      box(1.15, 9, 1.4, 4.5, 4.8, 0, red, group);
      box(11, 1.5, 1.9, 0, 9.4, 0, red, group);
      box(7, 0.7, 2.1, 0, 7.3, 0, red, group);
      box(1.3, 16, 1.3, 0, 8.2, -5, materials.dark, group);
      for (const offset of [-3, -1, 1, 3]) sphere(0.35, offset, 9.5, 1, materials.lamp, group);
    } else if (country.landmark === "spire") {
      for (let i = 0; i < 7; i += 1) {
        const h = 4.3;
        const width = 6 - i * 0.68;
        box(width, h, width, 0, i * h + h / 2 + 0.2, 0, accent, group);
      }
      box(0.3, 7, 0.3, 0, 33.7, 0, materials.lamp, group);
    } else if (country.landmark === "beach") {
      const wood = mat(0xd6b38c);
      for (const side of [-1, 1]) {
        box(0.55, 5.8, 0.55, side * 4.1, 3.15, 0, wood, group);
        box(0.55, 5.8, 0.55, side * 4.1, 3.15, 6.2, wood, group);
      }
      box(10.2, 0.8, 8.2, 0, 6.4, 3.1, mat(0xf0d39a), group);
      box(4, 1.1, 1.2, 0, 1.0, 3.1, mat(0x56adba), group);
    } else if (country.landmark === "pyramids") {
      const stone = mat(0xd7b67f);
      for (const [x, z, radius, height] of [[-2, 1, 5.4, 9], [5, -1, 3.5, 5.5]]) {
        const pyramid = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 4), stone);
        pyramid.rotation.y = Math.PI / 4;
        pyramid.position.set(x, height / 2 + 0.35, z);
        pyramid.castShadow = !mobile;
        group.add(pyramid);
      }
    }
    group.visible = false;
  }

  // Animated non-interactive traffic adds depth; no online presence is claimed.
  const cars = [];
  for (let i = 0; i < 5; i += 1) {
    const group = new THREE.Group();
    const color = mat([0xb13e3a, 0x4a8bba, 0xd8c9b0, 0x263b5a, 0xbfa25a][i], { metalness: 0.35, roughness: 0.4 });
    box(4.1, 1.05, 2.1, 0, 0.87, 0, color, group);
    box(2.1, 0.78, 1.7, -0.25, 1.72, 0, mat(0x354b64, { metalness: 0.4 }), group);
    for (const side of [-1, 1]) for (const front of [-1.25, 1.25]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.26, 10), materials.dark);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(front, 0.52, side * 1.08);
      group.add(wheel);
    }
    group.position.set(-104 + 26 * i, 0.05, [-88, -44, 0, 44, 88][i]);
    scene.add(group);
    cars.push({ group, speed: 3.7 + i * 0.65 });
  }

  const character = new THREE.Group();
  const outfitMaterial = mat(VCR_OUTFITS.violet, { roughness: 0.72 });
  const faceMaterial = mat(0xdca98d);
  const hairMaterial = mat(0x22222d);
  const shirt = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.36, 1.17, 10), outfitMaterial);
  shirt.position.y = 1.92;
  character.add(shirt);
  sphere(0.39, 0, 2.88, 0, faceMaterial, character);
  const hair = sphere(0.41, 0, 3.07, -0.02, hairMaterial, character);
  hair.scale.set(1, 0.45, 1);
  const legs = [];
  for (const side of [-1, 1]) {
    const limb = new THREE.Group();
    limb.position.set(side * 0.22, 1.35, 0);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 1.16, 8), materials.dark);
    leg.position.y = -0.56;
    limb.add(leg);
    character.add(limb);
    legs.push(limb);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.12, 1.2, 8), faceMaterial);
    arm.position.set(side * 0.63, 1.85, 0);
    arm.rotation.z = side * 0.16;
    character.add(arm);
  }
  const footShadow = new THREE.Mesh(new THREE.CircleGeometry(0.85, 16),
    new THREE.MeshBasicMaterial({ color: 0x151927, transparent: true, opacity: 0.26, depthWrite: false }));
  footShadow.rotation.x = -Math.PI / 2;
  footShadow.position.y = 0.1;
  character.add(footShadow);
  character.position.set(0, 0.08, 0);
  scene.add(character);

  const keys = { forward: false, backward: false, left: false, right: false };
  let yaw = 0.55;
  let currentDistrict = "central";
  let currentCountry = "us";
  let dragging = false;
  let activePointer = null;
  let pointerX = 0;
  let disposed = false;
  let raf = 0;
  let time = performance.now();

  function setDirection(direction, enabled) {
    if (Object.prototype.hasOwnProperty.call(keys, direction)) keys[direction] = Boolean(enabled);
  }
  function stopMoving() { for (const k of Object.keys(keys)) keys[k] = false; }
  function onKeyDown(e) {
    const key = e.key.toLowerCase();
    const dir = { w: "forward", arrowup: "forward", s: "backward", arrowdown: "backward",
      a: "left", arrowleft: "left", d: "right", arrowright: "right" }[key];
    if (dir && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); setDirection(dir, true); }
  }
  function onKeyUp(e) {
    const dir = { w: "forward", arrowup: "forward", s: "backward", arrowdown: "backward",
      a: "left", arrowleft: "left", d: "right", arrowright: "right" }[e.key.toLowerCase()];
    if (dir) { e.preventDefault(); setDirection(dir, false); }
  }
  function onPointerDown(e) {
    dragging = true;
    activePointer = e.pointerId;
    pointerX = e.clientX;
    canvas.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e) {
    if (!dragging || e.pointerId !== activePointer) return;
    yaw -= (e.clientX - pointerX) * 0.006;
    pointerX = e.clientX;
  }
  function onPointerUp(e) {
    if (activePointer === e.pointerId) { dragging = false; activePointer = null; }
  }
  function teleport(id) {
    const target = VCR_DISTRICTS.find((d) => d.id === id);
    if (!target) return false;
    character.position.set(target.x, 0.08, target.z);
    stopMoving();
    currentDistrict = id;
    onDistrictChange?.(id);
    return true;
  }
  function travelCountry(id) {
    const country = findVcrCountry(id);
    if (!country) return false;
    // Country travel takes the visitor to a safe public road, never into a
    // building or a private user space. No simulated people are created.
    character.position.set(country.x, 0.08, country.z);
    stopMoving();
    currentCountry = id;
    scene.background.setHex(country.sky);
    scene.fog.color.setHex(country.fog);
    for (const [otherId, landmark] of countryLandmarks) landmark.visible = otherId === id;
    onCountryChange?.(id);
    return true;
  }
  function setOutfit(id) {
    if (Object.prototype.hasOwnProperty.call(VCR_OUTFITS, id)) outfitMaterial.color.setHex(VCR_OUTFITS[id]);
  }
  function resize() {
    if (disposed) return;
    const width = Math.max(canvas.clientWidth, 1);
    const height = Math.max(canvas.clientHeight, 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  function frame(now) {
    if (disposed) return;
    raf = window.requestAnimationFrame(frame);
    const dt = Math.min((now - time) / 1000, 0.05);
    time = now;
    if (document.hidden) return;
    const forward = Number(keys.forward) - Number(keys.backward);
    const sideways = Number(keys.right) - Number(keys.left);
    let dx = -Math.sin(yaw) * forward + Math.cos(yaw) * sideways;
    let dz = -Math.cos(yaw) * forward - Math.sin(yaw) * sideways;
    const movement = Math.hypot(dx, dz);
    if (movement > 0) {
      dx = dx / movement * dt * 8.5;
      dz = dz / movement * dt * 8.5;
      const nx = character.position.x + dx;
      const nz = character.position.z + dz;
      if (isWalkable(nx, character.position.z, solid)) character.position.x = nx;
      if (isWalkable(character.position.x, nz, solid)) character.position.z = nz;
      character.rotation.y = Math.atan2(dx, dz);
    }
    legs[0].rotation.x = movement ? Math.sin(now * 0.011) * 0.42 : 0;
    legs[1].rotation.x = -legs[0].rotation.x;
    for (const car of cars) {
      car.group.position.x += car.speed * dt;
      if (car.group.position.x > 111) car.group.position.x = -111;
    }
    const target = character.position.clone().add(new THREE.Vector3(0, 2.35, 0));
    const behind = new THREE.Vector3(Math.sin(yaw) * 9.4, 5.1, Math.cos(yaw) * 9.4);
    camera.position.lerp(target.clone().add(behind), Math.min(1, dt * 5.7));
    camera.lookAt(target);
    sun.position.set(character.position.x - 45, 90, character.position.z - 35);
    sun.target.position.set(character.position.x, 0, character.position.z);
    sun.target.updateMatrixWorld();
    renderer.render(scene, camera);
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", stopMoving);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  observer?.observe(canvas);
  window.addEventListener("resize", resize);
  resize();
  teleport("central");
  travelCountry("us");
  frame(performance.now());

  return {
    setDirection, setOutfit, teleport, travelCountry, stopMoving,
    dispose() {
      if (disposed) return;
      disposed = true;
      window.cancelAnimationFrame(raf);
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", stopMoving);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      const geometries = new Set();
      const ownedMaterials = new Set();
      const textures = new Set();
      scene.traverse((obj) => {
        if (obj.isMesh && obj.geometry) geometries.add(obj.geometry);
        if (obj.isMesh && obj.material) {
          for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) {
            ownedMaterials.add(m);
            if (m.map) textures.add(m.map);
          }
        }
      });
      for (const g of geometries) g.dispose();
      for (const m of ownedMaterials) m.dispose();
      for (const t of textures) t.dispose();
      renderer.dispose();
    },
  };
}
