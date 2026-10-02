# Digimon Auto Chess

A browser auto battler in the Teamfight Tactics mould, themed on Digimon: buy rookies, merge three copies into a
Champion and then a Mega — choosing the branch at each step — and watch your team fight in a neon Digital World.
Plays on desktop and phones. **Live: <https://digimon-autochess.pages.dev>**

![Five Mega Digimon on the holographic board](public/og.jpg)

*Non-commercial fan project. Digimon and all related names belong to their owners; see [CREDITS.md](CREDITS.md)
for model sources.*

## What's in it

- **85 forms in 24 evolution lines**, plus 3 wild Digimon that roam the enemy waves and 4 boss-only villains —
  every one an animated 3D model — with branching digivolutions and 75 named signature ultimates (Terra Force,
  Cocytus Breath, Positron Laser…). Boss rounds draw from candidates, so runs and matches differ.
- **Synergies** (three attributes in a counter triangle, five families with two tiers each), **items** that
  fuse in pairs into 12 stronger ones, boss rounds, a 15-round run plus endless mode.
- **VS for 2–8 players** — with friends over a 4-letter room code, or with strangers through a public
  matchmaking queue — in Teamfight Tactics' round rhythm: a round-robin of opponents (a ghost copy of someone's
  board for the odd one out), stages of five rounds with wild-Digimon rounds, a carousel item draft every stage
  (lowest HP picks first), three augment picks per match, a shared unit pool (what one player collects the
  others can't), a boss every tenth round, loss damage that grows by stage, a planning timer, live scouting of
  any player's board, knockouts, places 1–8 and a rating. Reconnects survive a phone switching apps; play again
  in the same room.
- **Leaderboard and ghost battles** against other players' saved boards.
- **Game feel**: hit-stop, camera shake, sparks, pooled damage numbers, a cinematic beat for Mega ultimates,
  "data deletion" deaths, a materialize-in at the start of every fight.
- **Sound with no audio files**: weighty hits, ultimate stingers and a procedural synthwave soundtrack that
  shifts between prep, battle and boss rounds.
- **Tamer's Guide** (❓): the rules, every line with stats and ultimates, synergies, item recipes and VS —
  generated from the game data, so it can't drift from the code.
- Quality-of-life: 2× battle speed, shop lock, hotkeys, drag-to-sell, damage meter, next-wave preview,
  tooltips, first-run tutorial, volume / graphics / reduced-motion settings.

## How it's built

| Layer | Tech |
|---|---|
| UI and state | React 19, TypeScript, zustand |
| 3D | React Three Fiber (three.js 0.185), drei, postprocessing (HDR bloom, Neutral tone mapping) |
| Multiplayer, leaderboard | Cloudflare Worker with Durable Objects (`Lobby`, `Matchmaker`, `Leaderboard`) |
| Hosting | Cloudflare Pages, long-lived immutable caching for hashed models and assets |

Design choices worth a look:

- **One deterministic simulation everywhere.** `src/game/battle.ts` steps combat at a fixed 0.05 s, with stable
  iteration order and `Math.sqrt` instead of `Math.hypot` (whose rounding differs between engines). The browser,
  every VS client and the balance bots run the exact same code.
- **A lobby with no game server.** In VS, every client simulates *every* fight of the round from the same boards
  and reports the outcomes; the room (`server/src/lobby.ts`) applies the first report and compares the rest.
  Pairings, ghosts, places and rating are pure rules in `src/game/lobby.ts`, shared by the worker and the
  clients; `npm run lobbycheck` plays thousands of random lobbies through them. Every build is stamped with a hash
  of `src/game/` (`scripts/rules-version.mjs`, run by the site build and by the worker's build), and the worker
  lets a client into VS only on its own rules — a tab left open across an update reloads instead of simulating
  other fights, while a match already running when an update lands finishes on the rules it started with.
- **Cosmetics never touch the sim.** Hit-stop, slow motion and 2× speed only change *when* fixed steps run in
  real time (`src/three/juice.ts`), so replays and PvP results stay identical.
- **No per-tick React renders for units.** Each unit reads its fighter state in `useFrame` through a small mutable
  "drive" object; animation events (attack, cast, hit, death) are counters the model reacts to.
- **Model pipeline.** `npm run optimize-models` turns the source rips (213 MB) into 46 MB of meshopt-compressed,
  WebP-textured glTF with pruned animation clips, harmonized scale tracks and content-hashed URLs;
  `npm run check-models` validates all 92. Conversion scripts fix what rips get wrong: baked black vertex colours,
  3ds Max's default grey diffuse, effect meshes the original game drew with its own shaders.
- **Rendered assets from the real scene.** Dev-only "studios" (`/?studio`, `/?studio=og`, `/?studio=icon`) render
  the 92 portraits, the link-preview image and the app icons with the game's own lighting.
- **Balance from data.** `npm run balance` runs thousands of scrims per form (every form wins 42–58%);
  `npm run runsim` has a bot play complete runs through the real store (shop odds, merges, economy, waves,
  bosses) to tune the difficulty curve — currently about 4 in 10 runs beat the round-15 boss.

## Run it

```bash
npm install
npm run dev            # Vite dev server
npm run build          # type-check + production build
npm run balance        # per-form win rates, role matrix, fight lengths
npm run runsim         # bot full-run simulator (runs=300 seed=1 variant=current)
npm run lobbycheck     # VS lobby rules: pairings, ghosts, knockouts, places (matches=2000)
npm run optimize-models
npm run check-models
```

The worker lives in `server/` (`npx wrangler deploy --config server/wrangler.jsonc`).

## Project docs

- [ROADMAP.md](ROADMAP.md) — audit, milestones and the work journal (in Ukrainian)
- [PVP-DESIGN.md](PVP-DESIGN.md) — Teamfight Tactics analysis and the plan for lobby-based PvP (in Ukrainian)
- [ASSETS.md](ASSETS.md), [MODELS_CHECKLIST.md](MODELS_CHECKLIST.md), [models-src/README.md](models-src/README.md) — model sourcing and pipeline
