import { useGLTF } from "@react-three/drei";

/**
 * Registry of creature models, keyed by base creature id (see creatures.ts) then by
 * star / evolution stage: 1 = Rookie, 2 = Champion, 3 = Ultimate.
 *
 * Drop a `.glb` into `public/models/` and add its path at the right star. A missing
 * star falls back to the highest lower star that exists, then to the animated
 * procedural creature — so the game always renders, and you can add evolutions later.
 *
 * Example once you have the whole Agumon line:
 *   agumon: { 1: "/models/agumon.glb", 2: "/models/greymon.glb", 3: "/models/metalgreymon.glb" },
 */
type StarSlot = Partial<Record<1 | 2 | 3, string>>;

export const MODEL_PATHS: Partial<Record<string, StarSlot>> = {
  // "Digimon Linkz - Agumon" by akennedy007 (Sketchfab) — CC-BY. See CREDITS.md.
  agumon: { 1: "/models/digimon_linkz_-_agumon.glb" },
};

/** Target on-board height (world units) every model is normalized to.
 *  Roughly matches the procedural creature so models + fallbacks sit at one scale. */
export const TARGET_HEIGHT = 1.25;

export function modelFor(defId: string, star: 1 | 2 | 3): string | undefined {
  const slot = MODEL_PATHS[defId];
  if (!slot) return undefined;
  for (let s = star; s >= 1; s--) {
    const path = slot[s as 1 | 2 | 3];
    if (path) return path;
  }
  return undefined;
}

// Warm the cache for all registered models.
for (const slot of Object.values(MODEL_PATHS)) {
  if (!slot) continue;
  for (const path of Object.values(slot)) if (path) useGLTF.preload(path);
}
