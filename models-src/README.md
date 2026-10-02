# models-src — original creature models (source of truth)

These are the unmodified model files (Cyber Sleuth rips via the DigiChess repo, plus the
Sketchfab Agumon — see `CREDITS.md`), with their external `.png` textures. **Never edit the
shipped copies in `public/models/` — they are generated.**

Pipeline:

1. New rip → `python3 scripts/convert_model.py <file.fbx|.dae> <formId>` (assimp → `models-src/<formId>.glb`,
   strips baked vertex colors, resets 3ds Max's default grey diffuse, copies textures — a different file under a
   taken name gets the form id as a prefix). Then, if needed:
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

## Straight from the game files (Digimon Story Cyber Sleuth: Complete Edition)

The game is Windows-only; on a Mac its files come through SteamCMD (the account must own it):

    brew install --cask steamcmd
    steamcmd +@sSteamCmdForcePlatformType windows +force_install_dir ~/Games/dscs +login <steam login> +app_update 1042550 validate +quit

1. `scripts/dscs_setup.sh` (once): builds MVGLTools (patched for Apple's libc++), fetches Blender-Tools-for-DSCS
   for its file readers, makes a venv with numpy + Pillow, unpacks the main archive (~13 GB) and the name /
   shared-clip tables — all under `model-sources/` (git-ignored). No Blender: the 2.91 the importer needs
   corrupts its own heap at random under Rosetta, so `scripts/dscs_to_glb.py` writes the glTF itself (~1 s).
2. `python3 scripts/dscs_convert.py --list [name]` — the game's 368 models: chr number, name, clips, and which are
   already in our roster.
3. `python3 scripts/dscs_convert.py <chr number> <formId>` → `models-src/<formId>.glb` with canonical clip names.
   A model without clips of its own borrows another's, as the game does (GeoGreymon plays Greymon's); the cel
   outline shells (`MTR_line*`) are dropped. The game's clips are relative to the bind pose (the inverse bind
   matrices), so that is baked into the keys. Then the steps above: optimize, check, portrait, browser.
