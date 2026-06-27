import { useGLTF } from "@react-three/drei";

/**
 * Registry of AI-generated creature models. Drop a `.glb` into `public/models/`
 * and add its path here keyed by creature id (see src/game/creatures.ts).
 * Any id NOT listed here automatically falls back to the animated procedural
 * creature — so the game always renders, models or not.
 *
 * Example once you have a file:
 *   agumon: "/models/agumon.glb",
 */
export const MODEL_PATHS: Partial<Record<string, string>> = {
  // "Digimon Links Agumon" by JackTheOhio (Sketchfab) — CC-BY. See CREDITS.md.
  agumon: "/models/digimon_linkz_-_agumon.glb",
  // gabumon: "/models/gabumon.glb",
};

/** Target on-board height (world units) every model is normalized to.
 *  Roughly matches the procedural creature so models + fallbacks sit at one scale. */
export const TARGET_HEIGHT = 1.25;

export function modelFor(defId: string): string | undefined {
  return MODEL_PATHS[defId];
}

// Warm the cache for any registered models.
for (const path of Object.values(MODEL_PATHS)) {
  if (path) useGLTF.preload(path);
}
