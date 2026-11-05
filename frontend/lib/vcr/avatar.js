export const VCR_OUTFITS = Object.freeze({ violet: 0x985cff, cyan: 0x16c8da, pink: 0xef58a9 });

// Original articulated placeholder, human proportions; no photograph processing.
// Clothing color is the current customization, not a photorealistic asset claim.
export function createAvatar(THREE, outfit = "violet") {
  const root = new THREE.Group(), resources = [];
  const mat = (color) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8 }); resources.push(m); return m; };
  const shirt = mat(VCR_OUTFITS[outfit] || VCR_OUTFITS.violet), skin = mat(0xc58f71), hair = mat(0x28212a), trousers = mat(0x303a50), shoe = mat(0xe4e0d8);
  function part(geometry, material, x, y, z, parent = root) {
    resources.push(geometry); const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }
  part(new THREE.CylinderGeometry(0.31, 0.25, 0.75, 12), shirt, 0, 1.5, 0);
  part(new THREE.SphereGeometry(0.23, 14, 10), skin, 0, 2.13, 0);
  const cap = part(new THREE.SphereGeometry(0.24, 12, 8), hair, 0, 2.26, -0.02); cap.scale.y = 0.55;
  part(new THREE.CylinderGeometry(0.09, 0.11, 0.16, 8), skin, 0, 1.91, 0);
  // The nose provides an unambiguous facing direction for synchronized turning.
  part(new THREE.SphereGeometry(0.06, 6, 5), skin, 0, 2.12, 0.22);
  const legs = [], arms = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * 0.15, 1.12, 0); root.add(leg); legs.push(leg);
    part(new THREE.CapsuleGeometry(0.12, 0.77, 3, 8), trousers, 0, -0.5, 0, leg);
    const foot = part(new THREE.SphereGeometry(0.14, 8, 6), shoe, 0, -1.04, 0.07, leg); foot.scale.set(1, 0.6, 1.7);
    const arm = new THREE.Group(); arm.position.set(side * 0.38, 1.77, 0); root.add(arm); arms.push(arm);
    part(new THREE.CapsuleGeometry(0.09, 0.44, 3, 8), shirt, 0, -0.26, 0, arm);
    part(new THREE.SphereGeometry(0.085, 8, 6), skin, 0, -0.57, 0, arm);
  }
  return { root,
    setOutfit(id) { if (Object.hasOwn(VCR_OUTFITS, id)) shirt.color.setHex(VCR_OUTFITS[id]); },
    animate(time, moving) {
      const swing = moving ? Math.sin(time * 0.011) * 0.48 : 0;
      legs.forEach((leg, i) => { leg.rotation.x = i ? -swing : swing; });
      arms.forEach((arm, i) => { arm.rotation.x = i ? swing * 0.7 : -swing * 0.7; });
    },
    dispose() { root.removeFromParent(); resources.forEach((r) => r.dispose()); },
  };
}
