import { useGLTF } from "@react-three/drei";
import { ALL_FORM_IDS, ROOKIE_IDS } from "../game/creatures";

/**
 * Every form in the roster has a real animated model at /models/<formId>.glb —
 * the roster is deliberately shaped around sourceable models (see CREDITS.md).
 * The procedural creature remains as a Suspense fallback while a model streams in.
 */
/** Bump when model FILES change without renaming — the URLs stay the same across
 *  deploys and browsers cache .glb aggressively, so this busts stale caches. */
const MODELS_VERSION = 3;

export const MODEL_PATHS: Partial<Record<string, string>> = Object.fromEntries(
  ALL_FORM_IDS.map((id) => [id, `/models/${id}.glb?v=${MODELS_VERSION}`]),
);

/** Target on-board height (world units) every model is normalized to. */
export const TARGET_HEIGHT = 1.25;

/** Per-model orientation/scale fixes for rips that import rotated or odd-sized. */
export interface ModelTweak {
  /** extra rotation [x, y, z] in radians applied to the raw model */
  rot?: [number, number, number];
  /** multiplier on the normalized height */
  scale?: number;
}
export const MODEL_TWEAKS: Record<string, ModelTweak> = {};

export function modelFor(formId: string): string | undefined {
  return MODEL_PATHS[formId];
}

export function tweakFor(formId: string): ModelTweak | undefined {
  return MODEL_TWEAKS[formId];
}

// Preload only the Rookies (what the shop shows first); higher stages stream in
// on evolve with the procedural creature as the loading fallback.
for (const id of ROOKIE_IDS) useGLTF.preload(`/models/${id}.glb?v=${MODELS_VERSION}`);
