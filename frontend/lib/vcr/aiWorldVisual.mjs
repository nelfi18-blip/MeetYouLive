import { AiWorldAssetError } from "./aiWorldAssets.mjs";

/**
 * Mount *genuine* generated Marble SPZ imagery with the Spark WebGL renderer.
 * This function takes reviewed dependencies as arguments: it never fetches
 * SDK code at runtime, initiates a generation job, or creates a fake city.
 *
 * IMPORTANT: this is a VISUAL layer only. The separate collider GLB must be
 * registered/aligned against authoritative World physics before allowing
 * movement. Mounting the splat does NOT grant walking or online membership.
 */
export async function mountAiWorldVisual({
  descriptor, THREE, renderer, scene, SparkRenderer, SplatMesh, signal,
}) {
  if (!descriptor || descriptor.generatedByAi !== true ||
      descriptor.aiContentLabelRequired !== true ||
      descriptor.interactionReady !== false ||
      !descriptor.splat100kUrl || !descriptor.colliderGlbUrl) {
    throw new AiWorldAssetError("Approved AI-world spatial descriptor required");
  }
  if (typeof THREE?.Group !== "function" ||
      typeof SparkRenderer !== "function" ||
      typeof SplatMesh !== "function" ||
      !renderer || !scene?.add) {
    throw new AiWorldAssetError("AI-world rendering dependencies are unavailable");
  }
  if (signal?.aborted) throw new AiWorldAssetError("AI-world load cancelled");

  let splats, spark, axis, disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    axis?.removeFromParent?.();
    splats?.dispose?.();
    spark?.removeFromParent?.();
    spark?.dispose?.();
  };

  try {
    spark = new SparkRenderer({ renderer });
    scene.add(spark);
    // Marble raw OpenCV -> Three.js conversion: rotate 180 degrees around X.
    // Scale centers AND Gaussian sizes before subtracting metric ground offset.
    // The offset belongs to the pre-rotation metric frame, not splat sizes.
    axis = new THREE.Group();
    axis.rotation.x = Math.PI;
    const metric = new THREE.Group();
    metric.scale.setScalar(descriptor.worldSpatialScale);
    metric.position.y = -descriptor.groundPlaneOffset;
    axis.add(metric);

    splats = new SplatMesh({ url: descriptor.splat100kUrl });
    metric.add(splats);
    scene.add(axis);
    if (!splats.initialized || typeof splats.initialized.then !== "function") {
      throw new AiWorldAssetError("AI-world visual loading cannot be verified");
    }
    await splats.initialized;
    if (signal?.aborted) throw new AiWorldAssetError("AI-world load cancelled");
    return Object.freeze({
      visualReady: true,
      interactionReady: false,
      axis,
      // Still pending: GLB collider registration, server coordinate mapping,
      // accessible controls, actual mobile rendering and licensed asset trial.
      dispose,
    });
  } catch (error) {
    dispose();
    // Do not include remote signed URLs or responses in error messages.
    throw error instanceof AiWorldAssetError
      ? error
      : new AiWorldAssetError("AI-world visual asset failed to initialize");
  }
}
