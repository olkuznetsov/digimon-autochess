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
};

/** Target on-board height (world units) every model is normalized to. */
export const TARGET_HEIGHT = 1.25;

export function modelFor(formId: string): string | undefined {
  return MODEL_PATHS[formId];
}

// Warm the cache for any registered models.
for (const path of Object.values(MODEL_PATHS)) {
  if (path) useGLTF.preload(path);
}
