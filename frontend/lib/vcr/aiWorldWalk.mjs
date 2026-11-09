import { AiWorldAssetError } from "./aiWorldAssets.mjs";
import { loadApprovedAiWorldScene } from "./loadAiWorldScene.mjs";
import { createAiWorldWalkController } from "./aiWorldWalkController.mjs";

/**
 * First-person rendering of an actual approved SPZ + GLB pair.
 * The server's reviewed navigation grid controls motion, not the splat pixels
 * or the old procedural district geometry. Never mount in production.
 */
export async function createApprovedAiWorldWalk({
  canvas, THREE, descriptor, navigation, signal, onContextLost,
  isolationMode = process.env.NEXT_PUBLIC_WORLD_TEST_MODE,
  loadScene = loadApprovedAiWorldScene,
}) {
  if (isolationMode !== "isolated" || !canvas ||
      typeof THREE?.WebGLRenderer !== "function" ||
      typeof THREE?.PerspectiveCamera !== "function" ||
      typeof THREE?.Scene !== "function" ||
      typeof loadScene !== "function" || signal?.aborted) {
    throw new AiWorldAssetError("Isolated World AI renderer is unavailable");
  }

  const controls = createAiWorldWalkController({ descriptor, navigation });
  let renderer, layer, camera, scene, frameId = 0, observer = null;
  let disposed = false, lost = false, lastFrame = 0, pointer = null;
  let touchX = 0, touchY = 0, pitch = 0;
  let slowFrames = 0;
  const moveKey = (event) => ({
    w: "forward", arrowup: "forward", s: "backward", arrowdown: "backward",
    a: "left", arrowleft: "left", d: "right", arrowright: "right",
  })[event.key?.toLowerCase()];

  function keyDown(event) {
    if (event.target?.matches?.("input,textarea,select,[contenteditable=true]") ||
        event.ctrlKey || event.metaKey || event.altKey) return;
    const key = moveKey(event);
    if (key) { event.preventDefault(); controls.setDirection(key, true); }
  }
  function keyUp(event) { const key = moveKey(event); if (key) controls.setDirection(key, false); }
  function pointerDown(event) {
    pointer = event.pointerId;
    touchX = event.clientX; touchY = event.clientY;
    canvas.setPointerCapture?.(pointer);
  }
  function pointerMove(event) {
    if (event.pointerId !== pointer || disposed || lost) return;
    controls.setViewYaw(controls.getPosition().yaw - (event.clientX - touchX) * 0.006);
    pitch = Math.max(-1.15, Math.min(1.15, pitch - (event.clientY - touchY) * 0.004));
    touchX = event.clientX; touchY = event.clientY;
  }
  function pointerUp(event) { if (pointer === event.pointerId) pointer = null; }
  function contextLost(event) {
    event.preventDefault();
    lost = true;
    controls.setInputEnabled(false);
    onContextLost?.();
  }
  function visibility() { if (document.hidden) controls.stopMoving(); }
  function resize() {
    if (disposed || !renderer || !camera) return;
    const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  function frame(now) {
    if (disposed || lost) return;
    frameId = window.requestAnimationFrame(frame);
    if (document.hidden) { lastFrame = now; return; }
    const elapsed = lastFrame ? Math.max(0, (now - lastFrame) / 1000) : 0;
    lastFrame = now;
    const dt = Math.min(0.05, elapsed);
    const position = controls.advance(dt);
    // A long-lived high frame time lowers fill-rate instead of consuming
    // unlimited memory on a mobile browser.
    if (elapsed > 0.05 && ++slowFrames === 45) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 0.8));
      resize();
    }
    const eye = position.y + 1.65;
    camera.position.set(position.x, eye, position.z);
    const horizontal = Math.cos(pitch);
    camera.lookAt(
      position.x - Math.sin(position.yaw) * horizontal * 10,
      eye + Math.sin(pitch) * 10,
      position.z - Math.cos(position.yaw) * horizontal * 10,
    );
    renderer.render(scene, camera);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    controls.dispose();
    if (frameId) window.cancelAnimationFrame(frameId);
    observer?.disconnect();
    window.removeEventListener("keydown", keyDown);
    window.removeEventListener("keyup", keyUp);
    window.removeEventListener("blur", controls.stopMoving);
    window.removeEventListener("resize", resize);
    document.removeEventListener("visibilitychange", visibility);
    canvas.removeEventListener("pointerdown", pointerDown);
    canvas.removeEventListener("pointermove", pointerMove);
    canvas.removeEventListener("pointerup", pointerUp);
    canvas.removeEventListener("pointercancel", pointerUp);
    canvas.removeEventListener("lostpointercapture", pointerUp);
    canvas.removeEventListener("webglcontextlost", contextLost);
    layer?.dispose();
    renderer?.dispose();
  }

  try {
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, powerPreference: "low-power",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080b17);
    camera = new THREE.PerspectiveCamera(70, 1, 0.05, 400);

    // Full WebCrypto verification of both files precedes camera activation.
    layer = await loadScene({ descriptor, THREE, renderer, scene, signal });
    if (disposed || signal?.aborted || !layer?.visualReady || !layer?.colliderReady) {
      throw new AiWorldAssetError("World AI assets could not be verified");
    }

    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", controls.stopMoving);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", visibility);
    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointercancel", pointerUp);
    canvas.addEventListener("lostpointercapture", pointerUp);
    canvas.addEventListener("webglcontextlost", contextLost);
    observer = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
    observer?.observe(canvas);
    resize();
    frame(performance.now());

    return Object.freeze({ ...controls, dispose,
      inspect: () => Object.freeze({
        country: descriptor.country, providerWorldId: descriptor.providerWorldId,
        actualAiAssets: true, authenticated: false,
      }),
    });
  } catch {
    dispose();
    // Never reveal signed SPZ or GLB URLs in UI/logs.
    throw new AiWorldAssetError("Approved World AI scene could not be started");
  }
}
