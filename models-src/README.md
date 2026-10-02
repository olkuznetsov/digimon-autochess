# models-src — original creature models (source of truth)

These are the unmodified model files (Cyber Sleuth rips via the DigiChess repo, plus the
Sketchfab Agumon — see `CREDITS.md`), with their external `.png` textures. **Never edit the
shipped copies in `public/models/` — they are generated.**

Pipeline:

1. New rip → `python3 scripts/convert_model.py <file.fbx|.dae> <formId>` (assimp → `models-src/<formId>.glb`,
   strips baked vertex colors, resets 3ds Max's default grey diffuse, copies textures). Then, if needed:
   `python3 scripts/dedup_clips.py models-src/<formId>.glb` (duplicate partial takes) and
   `python3 scripts/rename_clips.py models-src/<formId>.glb` (Cyber Sleuth clip codes → idle/move/attack01…) and
   `python3 scripts/drop_meshes.py models-src/<formId>.glb <node>…` (effect meshes the game drew with its own
   shaders — glowing ribbons, energy orbs — that render as garish or white shapes here).
2. `npm run optimize-models [-- <formId>]` → `public/models/<formId>.glb` (unused clips dropped, keys
   resampled, textures → WebP embedded, meshopt compression, baked-scale harmonization) and
   `src/three/model-manifest.ts` (content hashes used for cache busting).
3. `npm run check-models` — clips present, baked scale consistent across clips, manifest complete.
4. Portrait: `/?studio&only=<formId>` in the dev server writes `public/portraits/<formId>.webp`.
5. Verify in the browser (sizes, animation, no white/giant models) before committing.
