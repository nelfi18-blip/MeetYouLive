import rules from "../../../backend/src/lib/vcrWorldRules.cjs";

// Original procedural art only. Six distinct layouts/architectural treatments,
// deliberately a playable pilot rather than licensed replicas or photorealism.
export function buildDestination(THREE, scene, country, mobile) {
  const spec = rules.DESTINATIONS[country];
  const root = new THREE.Group();
  scene.add(root);
  const materials = new Set(), textures = new Set(), geometries = new Set();
  const material = (color, options = {}) => {
    const result = new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...options });
    materials.add(result); return result;
  };
  const sand = material(spec.ground), stone = material(0xc5b79c), dark = material(0x263645);
  const leaf = material(0x426f4c), wood = material(0x8b6545), water = material(0x428a9c, { roughness: 0.22, metalness: 0.4 });
  const glass = material(0x87b5c7, { metalness: 0.55, roughness: 0.24 });
  const glow = material(0xffd9a3, { emissive: 0xffd9a3, emissiveIntensity: country === "jp" ? 1.5 : 0.12 });
  function mesh(geometry, mat, x, y, z, parent = root) {
    geometries.add(geometry);
    const object = new THREE.Mesh(geometry, mat);
    object.position.set(x, y, z); object.receiveShadow = true;
    parent.add(object); return object;
  }
  const box = (w, h, d, x, y, z, mat, parent) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
  const cylinder = (r1, r2, h, x, y, z, mat, sides = 16) => mesh(new THREE.CylinderGeometry(r1, r2, h, sides), mat, x, y, z);
  const sphere = (r, x, y, z, mat) => mesh(new THREE.SphereGeometry(r, 12, 8), mat, x, y, z);
  function beam(a, b, radius, mat) {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
    const object = cylinder(radius, radius, from.distanceTo(to), 0, 0, 0, mat, 6);
    object.position.copy(from.clone().add(to).multiplyScalar(0.5));
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.sub(from).normalize());
    return object;
  }
  function palm(x, z) {
    cylinder(0.2, 0.36, 5, x, 2.5, z, wood, 8);
    for (let i = 0; i < 5; i += 1) {
      const frond = sphere(1, x, 5.2, z, leaf);
      frond.scale.set(3.0, 0.18, 0.65); frond.rotation.y = i * Math.PI / 5;
    }
  }
  function facade(base, night = false) {
    const canvas = document.createElement("canvas"); canvas.width = 128; canvas.height = 256;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = base; ctx.fillRect(0, 0, 128, 256);
    for (let y = 8; y < 256; y += 24) for (let x = 8; x < 128; x += 24) {
      ctx.fillStyle = night && (x + y) % 3 ? "#f9c998" : "#547385";
      ctx.fillRect(x, y, 15, 16); ctx.fillStyle = "#c0b49b"; ctx.fillRect(x - 2, y + 17, 19, 2);
    }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture);
    return material(0xffffff, { map: texture, roughness: 0.72 });
  }
  // Original repeatable ground detail keeps paths readable without asset downloads.
  const tile = document.createElement("canvas"); tile.width = 128; tile.height = 128;
  const pavingContext = tile.getContext("2d"); pavingContext.fillStyle = "#c5b79c"; pavingContext.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 8; row += 1) for (let col = 0; col < 8; col += 1) {
    pavingContext.fillStyle = (row + col) % 3 ? "#b9ae98" : "#cfc4ac";
    pavingContext.fillRect(col * 16 + 1, row * 16 + 1, 14, 14);
  }
  const pavingMap = new THREE.CanvasTexture(tile); pavingMap.colorSpace = THREE.SRGBColorSpace;
  pavingMap.wrapS = pavingMap.wrapT = THREE.RepeatWrapping; pavingMap.repeat.set(5, 5); textures.add(pavingMap);
  stone.map = pavingMap; stone.color.setHex(0xffffff);
  box(160, 0.2, 160, 0, -0.2, 0, sand);
  if (country !== "eg") {
    box(13, 0.04, 148, 0, -0.03, 0, material(country === "fr" ? 0xa49a8c : 0x3c4651));
    box(148, 0.04, 12, 0, -0.02, 18, stone);
    for (const x of [-9, 9]) box(3, 0.13, 142, x, 0, 0, stone);
  } else {
    box(8, 0.07, 140, 0, -0.01, 0, stone);
  }
  // The plaza and four safe fast-travel areas are shared physics landmarks.
  cylinder(10, 10, 0.14, 0, 0.02, 0, stone, 48);
  if (country !== "eg") {
    cylinder(2.5, 2.8, 0.6, 0, 0.3, 8, stone);
    cylinder(2.2, 2.2, 0.05, 0, 0.63, 8, water);
    cylinder(0.25, 0.4, 2.4, 0, 1.3, 8, stone);
  }
  const facadeMat = facade(country === "fr" ? "#c2b59d" : country === "jp" ? "#454a5d" : country === "br" ? "#d6c3a5" : "#788b97", country === "jp");
  for (const building of spec.buildings) {
    const { x, z, w, d, h } = building;
    if (country === "eg") {
      if (h > 10) {
        const pyramid = mesh(new THREE.ConeGeometry(w / Math.SQRT2, h, 4), sand, x, h / 2, z);
        pyramid.rotation.y = Math.PI / 4; pyramid.castShadow = !mobile;
        for (let i = 1; i <= 4; i += 1) box(w * (1 - i / 7), 0.12, d * (1 - i / 7), x, i * h / 7, z, stone);
      } else {
        for (const offset of [-5, 0, 5]) cylinder(0.7, 0.9, 7, x + offset, 3.5, z + 4, stone);
        box(w, 1.1, d, x, 7.5, z, stone);
      }
    } else if (country === "ae" || (country === "us" && x > 0)) {
      const tower = cylinder(w / 2, w / 2, h, x, h / 2, z, glass, country === "ae" ? 24 : 8);
      tower.castShadow = !mobile;
      for (let floor = 3; floor < h; floor += 4) cylinder(w / 2 + 0.12, w / 2 + 0.12, 0.17, x, floor, z, stone, country === "ae" ? 24 : 8);
      if (country === "ae") {
        cylinder(w / 3.3, w / 2, 8, x, h + 4, z, glass);
        cylinder(0.08, 0.35, 13, x, h + 13, z, glow, 8);
      }
    } else {
      const house = box(w, h, d, x, h / 2, z, facadeMat); house.castShadow = !mobile;
      box(w + 0.8, 0.6, d + 0.8, x, h, z, stone);
      if (country === "fr") {
        const roof = cylinder(4, w * 0.73, 4, x, h + 2.3, z, dark, 4); roof.rotation.y = Math.PI / 4;
        for (const side of [-1, 1]) box(1.1, 3.5, 1.1, x + side * 5, h + 4, z, stone);
        // Balconies and striped café awnings, rather than a recolored skyline.
        for (let floor = 4; floor < h; floor += 3.5) box(w + 0.5, 0.18, 1.2, x, floor, z + d / 2, dark);
        for (let i = 0; i < 6; i += 1) {
          const awning = box(w / 6, 0.14, 3.1, x - w / 2 + w / 12 + i * w / 6, 3, z + d / 2 + 0.8, i % 2 ? stone : material(0x58715f));
          awning.rotation.x = -0.18;
        }
      }
      if (country === "jp") {
        for (let i = 0; i < 3; i += 1) {
          const sign = box(1.1, 5 + i * 2, 0.3, x - w / 2 + 2 + i * 4, h * 0.55, z + d / 2 + 0.2,
            material([0xc6408b, 0x4398ae, 0xe5b673][i], { emissive: [0x6e184f, 0x125569, 0x765217][i], emissiveIntensity: 0.8 }));
          sign.rotation.z = i === 1 ? 0.05 : 0;
        }
        for (const side of [-1, 1]) sphere(0.6, x + side * 4, 3, z + d / 2 + 1, glow);
      }
    }
  }
  if (country === "fr") {
    // Original four-legged lattice tower with open arches and viewing platforms.
    const iron = material(0x736b5c, { metalness: 0.4 });
    const cx = 0, cz = -23;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      beam([cx + sx * 5, 0, cz + sz * 5], [cx + sx * 1.4, 15, cz + sz * 1.4], 0.24, iron);
      for (let y = 2; y < 13; y += 2.8) {
        const radius = 5 - y * 0.24;
        beam([cx + sx * radius, y, cz + sz * radius], [cx - sx * (radius - 0.6), y + 2.4, cz + sz * (radius - 0.6)], 0.08, iron);
      }
    }
    for (const y of [6, 12, 16]) box(11 - y / 2, 0.4, 11 - y / 2, cx, y, cz, iron);
    cylinder(0.06, 1.3, 9, cx, 20, cz, iron, 8);
    for (const x of [-14, 14]) for (const z of [0, 10, 22]) {
      cylinder(1.05, 1.05, 0.15, x, 1.3, z, wood); cylinder(0.1, 0.1, 1.2, x, 0.6, z, dark);
      for (const side of [-1, 1]) box(0.8, 0.1, 0.8, x + side * 1.7, 0.7, z, wood);
    }
  } else if (country === "jp") {
    const red = material(0xad3c44);
    for (const x of [-5, 5]) cylinder(0.4, 0.5, 7, x, 3.5, -25, red, 12);
    box(13, 0.7, 1, 0, 7.3, -25, dark); box(10.5, 0.5, 0.8, 0, 5.6, -25, red);
    for (const x of [-11, 11]) for (const z of [-15, 0, 15, 30]) {
      cylinder(0.08, 0.12, 4, x, 2, z, dark, 6); sphere(0.55, x, 4.2, z, glow);
    }
  } else if (country === "eg") {
    for (const x of [-9, 9]) for (const z of [0, 12, 24, 36]) {
      cylinder(0.85, 1, 5, x, 2.5, z, stone); cylinder(1.5, 0.9, 0.9, x, 5.2, z, stone);
    }
    // Dunes are outside the walkable boundary, not fake traversable terrain.
    for (const x of [-98, -70, 60, 95]) {
      const dune = sphere(24, x, -14, -85, sand); dune.scale.set(1.8, 1, 1);
    }
  }
  if (["us", "br", "ae"].includes(country)) {
    box(120, 0.1, 175, -137, -0.12, 0, water);
    box(14, 0.12, 148, -66, -0.05, 0, material(0xe2cea8));
    for (const z of [-56, -28, 0, 28, 56]) palm(-55, z);
    if (country === "br") {
      // Rio-inspired curved mountains, wave promenade and beach parasols.
      for (const [x, h] of [[-45, 35], [15, 45], [55, 29]]) {
        const hill = sphere(17, x, h / 4, -84, leaf); hill.scale.set(1, h / 16, 0.8);
      }
      for (let z = -60; z < 65; z += 7) {
        const wave = mesh(new THREE.TorusGeometry(2, 0.16, 4, 12, Math.PI), dark, -48, 0.1, z);
        wave.rotation.x = -Math.PI / 2;
      }
      for (const z of [-35, -10, 18, 43]) {
        cylinder(0.06, 0.06, 2.8, -65, 1.4, z, wood, 6);
        mesh(new THREE.ConeGeometry(2.3, 0.8, 12), glow, -65, 3, z);
      }
    }
  }
  // A landscaped social park in every destination, with architectural variety above.
  const lawn = cylinder(12, 12, 0.08, 36, 0, 36, country === "eg" ? sand : leaf, 32);
  lawn.receiveShadow = true;
  for (const x of [25, 46]) { palm(x, 44); box(4, 0.25, 0.9, x, 0.7, 32, wood); }
  scene.background = new THREE.Color(spec.sky);
  scene.fog = new THREE.Fog(spec.fog, 65, 200);
  return { root, dispose() {
    root.removeFromParent();
    for (const geometry of geometries) geometry.dispose();
    for (const mat of materials) mat.dispose();
    for (const texture of textures) texture.dispose();
  } };
}
