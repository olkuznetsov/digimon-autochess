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
  // Cyber Sleuth rips (animated FBX from the PiSuGames/DigiChess repo), .fbx→.glb via assimp.
  // All ship idle/move/attack01 clips matching the animation state machine. See CREDITS.md.
  greymon: "/models/greymon.glb",
  gabumon: "/models/gabumon.glb",
  garurumon: "/models/garurumon.glb",
  metalgarurumon: "/models/metalgarurumon.glb",
  gomamon: "/models/gomamon.glb",
  ikkakumon: "/models/ikkakumon.glb",
  guilmon: "/models/guilmon.glb",
  growlmon: "/models/growlmon.glb",
  patamon: "/models/patamon.glb",
  angemon: "/models/angemon.glb",
  magnaangemon: "/models/magnaangemon.glb",
  togemon: "/models/togemon.glb",
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
