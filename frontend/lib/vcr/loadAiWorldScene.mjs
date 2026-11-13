import { AiWorldAssetError } from "./aiWorldAssets.mjs";
import { loadMarbleCollider } from "./aiWorldCollider.mjs";
import { mountAiWorldVisual } from "./aiWorldVisual.mjs";

/**
 * Real Marble scene assembly. It NEVER calls world generation or billing APIs.
 * The backend must provide an approved, authenticated asset descriptor; the
 * browser cannot invent license/consent approvals.
 *
 * With no licensed scene or no collider this fails closed. There is no fake
 * building/panorama fallback. Multiplayer movement remains OFF until the
 * existing authoritative server has reviewed the same collision space.
 */
export async function loadApprovedAiWorldScene({
  descriptor, THREE, renderer, scene, signal,
  dependencies,
}) {
  if (!descriptor?.generatedByAi || descriptor.interactionReady !== false ||
      descriptor.aiContentLabelRequired !== true || !renderer || !scene ||
      !descriptor.colliderGlbUrl || !descriptor.splat100kUrl) {
    throw new AiWorldAssetError("World is not approved for AI-scene inspection");
  }
  if (signal?.aborted) throw new AiWorldAssetError("AI-world load cancelled");

  // Static imports are intentionally avoided. Spark is never initialized
  // during normal MeetYouLive navigation, login, Live or other social flows.
  const modules = dependencies || await Promise.all([
    import("@sparkjsdev/spark"),
    import("three/addons/loaders/GLTFLoader.js"),
  ]).then(([spark, gltf]) => ({
    SparkRenderer: spark.SparkRenderer,
    SplatMesh: spark.SplatMesh,
    GLTFLoader: gltf.GLTFLoader,
  }));

  let collider;
  let visual;
  try {
    collider = await loadMarbleCollider({
      descriptor, THREE, GLTFLoader: modules.GLTFLoader,
      signal, fetchAsset: modules.fetchAsset,
    });
    if (signal?.aborted) throw new AiWorldAssetError("AI-world load cancelled");

    visual = await mountAiWorldVisual({
      descriptor, THREE, renderer, scene,
      SparkRenderer: modules.SparkRenderer,
      SplatMesh: modules.SplatMesh, signal, fetchAsset: modules.fetchAsset,
    });
    if (signal?.aborted) throw new AiWorldAssetError("AI-world load cancelled");

    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      visual?.dispose();
      collider?.dispose();
    };
    return Object.freeze({
      source: "worldlabs-marble",
      generatedByAi: true,
      visualReady: true,
      colliderReady: true,
      // Collider load is necessary but not sufficient for server-authoritative
      // walking; never silently reuse the old box colliders for this world.
      multiplayerMovementReady: false,
      visual,
      collider,
      dispose,
    });
  } catch (error) {
    visual?.dispose();
    collider?.dispose();
    throw error instanceof AiWorldAssetError
      ? error
      : new AiWorldAssetError("AI-world scene could not be loaded");
  }
}
