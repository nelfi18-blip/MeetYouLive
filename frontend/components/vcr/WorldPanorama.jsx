"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./WorldPanorama.module.css";

// A real 360° photo is displayed from the photographer's fixed viewpoint.
// The inverted Three.js sphere is ONLY a projection surface for the photo,
// never a fabricated city, 3D avatar, or simulated live camera.
export default function WorldPanorama({ imageUrl, label, unavailable, leftLabel, rightLabel, zoomInLabel, zoomOutLabel }) {
  const hostRef = useRef(null);
  const controlsRef = useRef(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let alive = true;
    let renderer = null;
    let mesh = null;
    let camera = null;
    let geometry = null;
    let material = null;
    let texture = null;
    let observer = null;
    const cleanupFns = [];
    const host = hostRef.current;
    if (!host || !imageUrl) return undefined;
    setStatus("loading");

    let yaw = 0;
    let pitch = 0;
    let fov = 74;
    const activePointers = new Map();

    const redraw = () => {
      if (!alive || !renderer || !camera || !mesh) return;
      camera.rotation.order = "YXZ";
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
      camera.fov = fov;
      camera.updateProjectionMatrix();
      renderer.render(mesh.parent, camera);
    };

    const resize = () => {
      if (!renderer || !camera || !alive) return;
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      redraw();
    };

    const changeView = (yawDelta = 0, pitchDelta = 0, fovDelta = 0) => {
      yaw += yawDelta;
      pitch = Math.max(-1.32, Math.min(1.32, pitch + pitchDelta));
      fov = Math.max(40, Math.min(84, fov + fovDelta));
      redraw();
    };

    // Real buttons make 360° navigation keyboard- and accessibility-friendly.
    controlsRef.current = {
      left: () => changeView(0.38),
      right: () => changeView(-0.38),
      zoomIn: () => changeView(0, 0, -9),
      zoomOut: () => changeView(0, 0, 9),
    };

    const onDown = (event) => {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      event.currentTarget.setPointerCapture?.(event.pointerId);
    };
    const onMove = (event) => {
      const last = activePointers.get(event.pointerId);
      if (!last) return;
      const dx = event.clientX - last.x;
      const dy = event.clientY - last.y;
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      changeView(-dx * 0.004, -dy * 0.004);
    };
    const onUp = (event) => activePointers.delete(event.pointerId);
    const onWheel = (event) => {
      event.preventDefault();
      changeView(0, 0, Math.sign(event.deltaY) * 4);
    };
    const onKeyDown = (event) => {
      const keys = {
        ArrowLeft: [0.24, 0, 0], ArrowRight: [-0.24, 0, 0],
        ArrowUp: [0, 0.2, 0], ArrowDown: [0, -0.2, 0],
        "+": [0, 0, -7], "-": [0, 0, 7],
      };
      if (!keys[event.key]) return;
      event.preventDefault();
      changeView(...keys[event.key]);
    };

    const start = async () => {
      let THREE;
      try {
        THREE = await import("three");
        if (!alive) return;
        renderer = new THREE.WebGLRenderer({
          antialias: false, alpha: true, powerPreference: "low-power",
        });
        if (!alive) { renderer.dispose(); renderer = null; return; }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.domElement.tabIndex = 0;
        renderer.domElement.setAttribute("role", "img");
        renderer.domElement.setAttribute("aria-label", label);
        renderer.domElement.className = styles.canvas;
        renderer.domElement.style.touchAction = "none";
        host.appendChild(renderer.domElement);

        const dom = renderer.domElement;
        dom.addEventListener("pointerdown", onDown);
        dom.addEventListener("pointermove", onMove);
        dom.addEventListener("pointerup", onUp);
        dom.addEventListener("pointercancel", onUp);
        dom.addEventListener("lostpointercapture", onUp);
        dom.addEventListener("wheel", onWheel, { passive: false });
        dom.addEventListener("keydown", onKeyDown);
        cleanupFns.push(() => {
          dom.removeEventListener("pointerdown", onDown);
          dom.removeEventListener("pointermove", onMove);
          dom.removeEventListener("pointerup", onUp);
          dom.removeEventListener("pointercancel", onUp);
          dom.removeEventListener("lostpointercapture", onUp);
          dom.removeEventListener("wheel", onWheel);
          dom.removeEventListener("keydown", onKeyDown);
        });

        const scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 900);
        geometry = new THREE.SphereGeometry(500, 60, 40);
        geometry.scale(-1, 1, 1);
        material = new THREE.MeshBasicMaterial({ side: THREE.BackSide });
        mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
        observer = new ResizeObserver(resize);
        observer.observe(host);
        resize();

        // No third-party auth, telemetry, user image or payment is sent.
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin("anonymous");
        const loaded = await new Promise((resolve, reject) => {
          loader.load(imageUrl, resolve, undefined, reject);
        });
        if (!alive) { loaded.dispose(); return; }
        texture = loaded;
        texture.colorSpace = THREE.SRGBColorSpace;
        material.map = texture;
        material.needsUpdate = true;
        redraw();
        setStatus("ready");
      } catch {
        if (alive) setStatus("unavailable");
      }
    };

    start();
    return () => {
      alive = false;
      controlsRef.current = null;
      activePointers.clear();
      observer?.disconnect();
      cleanupFns.forEach((fn) => fn());
      texture?.dispose();
      material?.dispose();
      geometry?.dispose();
      if (renderer) {
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      }
    };
  }, [imageUrl, label]);

  return (
    <div className={styles.root} aria-label={label}>
      <div ref={hostRef} className={styles.surface} />
      {status === "loading" && <p className={styles.message} role="status">360°…</p>}
      {status === "unavailable" && <p className={styles.message} role="alert">{unavailable}</p>}
      {status === "ready" && <div className={styles.controls}>
        <button type="button" aria-label={leftLabel} onClick={() => controlsRef.current?.left()}>↶</button>
        <button type="button" aria-label={rightLabel} onClick={() => controlsRef.current?.right()}>↷</button>
        <button type="button" aria-label={zoomInLabel} onClick={() => controlsRef.current?.zoomIn()}>+</button>
        <button type="button" aria-label={zoomOutLabel} onClick={() => controlsRef.current?.zoomOut()}>−</button>
      </div>}
    </div>
  );
}
