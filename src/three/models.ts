import { useGLTF } from "@react-three/drei";

/**
 * Registry of creature models, keyed by **form id** (see creatures.ts) — every
 * Digimon form (Rookie/Champion/Ultimate) is its own model. Drop a `.glb` into
 * `public/models/` and add its path here. Any form NOT listed falls back to the
 * animated procedural creature, so the game always renders.
 *
 * Example as you download the Agumon line:
 *   greymon: "/models/greymon.glb",
 *   metalgreymon: "/models/metalgreymon.glb",
 */
export const MODEL_PATHS: Partial<Record<string, string>> = {
  // "Digimon Linkz - Agumon" by akennedy007 (Sketchfab) — CC-BY. See CREDITS.md.
  agumon: "/models/digimon_linkz_-_agumon.glb",
  // GeoGreymon — Cyber Sleuth rip (The Models Resource), .dae→.glb via assimp. Static (no clips).
  geogreymon: "/models/geogreymon.glb",
};

/** Target on-board height (world units) every model is normalized to. */
export const TARGET_HEIGHT = 1.25;

/** Per-model orientation/scale fixes for rips that import rotated or odd-sized. */
export interface ModelTweak {
  /** extra rotation [x, y, z] in radians applied to the raw model */
  rot?: [number, number, number];
  /** multiplier on the normalized height */
  scale?: number;
}
export const MODEL_TWEAKS: Record<string, ModelTweak> = {
  // Cyber Sleuth .dae rip imports upside-down — flip 180° on X.
  geogreymon: { rot: [Math.PI, 0, 0] },
};

export function modelFor(formId: string): string | undefined {
  return MODEL_PATHS[formId];
}

export function tweakFor(formId: string): ModelTweak | undefined {
  return MODEL_TWEAKS[formId];
}

// Warm the cache for any registered models.
for (const path of Object.values(MODEL_PATHS)) {
  if (path) useGLTF.preload(path);
}
