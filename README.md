# Digimon Auto Chess — vertical slice

A TFT-style auto battler with a Digimon theme, built to be **visually stunning** and to
learn real-time game systems. This is an early **vertical slice**: the core toy works, the
look is the point, multiplayer comes later.

## Stack

- **React 19 + TypeScript + Vite**
- **React Three Fiber** (Three.js) for 3D rendering
- **@react-three/drei** (helpers, in-world HTML labels)
- **@react-three/postprocessing** (Bloom + Vignette — the "premium neon" look)
- **zustand** for game state

Game logic lives entirely in `src/game/` and is **renderer-agnostic on purpose**: when
multiplayer lands, a Colyseus server replaces `store.ts` and the 3D layer barely changes.

## What works in the slice

- Fixed-camera 3D arena with glowing board, player (blue) / enemy (red) halves, bloom.
- **Shop**: 12-creature roster, cost-weighted odds, buy with gold, reroll.
- **Drag & drop** a creature from the bench onto your half of the board (raycast pointer events).
- **Digivolution**: 3 copies of the same creature at the same star auto-merge into the next
  star (Agumon → Greymon → MetalGreymon). Names + stats scale per star.
- **Synergies** (live panel): each creature has an **Attribute** (Vaccine/Data/Virus) and a
  **Family** (Dragon's Roar, Nature Spirits, Wind Guardians, Nightmare Soldiers, Deep Savers).
  Hitting a trait's threshold buffs **only that trait's units** (HP / attack / attack-speed).
- **Attribute triangle**: Vaccine > Virus > Data > Vaccine also gives a combat damage multiplier.
- **Economy**: gold income + **interest** (1 per 10 saved, cap 5), **win/loss streak** bonus,
  **level/XP** (buy XP or passive per round) which raises your board cap.
- **Auto-battle**: units acquire the nearest enemy, advance, attack on cooldown, die and are
  removed; round resolves to VICTORY / DEFEAT.
- **Progression**: enemy waves scale with the round; losing costs **player health** (scaled by
  surviving enemies); 0 health ⇒ **Game Over** + New Run.
- **Creatures**: animated procedural monsters (idle bob, blink, attack lunge). A **glTF model
  pipeline** is wired so AI-generated `.glb` files drop in per-creature with no glue code —
  see [`ASSETS.md`](ASSETS.md) for prompts and the workflow.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (or the port your launcher assigns)
```

## Project layout

```
src/
  game/            # pure logic — swap for Colyseus later
    types.ts       # Unit, Fighter, Placement, Phase, Attribute, Family
    creatures.ts   # roster, attribute/family colors, star stats, attribute triangle
    synergies.ts   # trait defs, counts, active tiers, buff application
    xpView.ts      # XP curve (shared by store + HUD)
    board.ts       # grid geometry + world<->cell conversions
    store.ts       # zustand store: shop, economy, drag, digivolve, battle sim
  three/           # rendering
    Scene.tsx             # Canvas, camera, lights, bloom, drag handling, battle runner
    Board.tsx             # board tiles + bench
    Creature.tsx          # wrapper: base ring, star pips, label + model-or-procedural body
    ProceduralCreature.tsx# animated blob fallback (idle/blink/attack lunge)
    CreatureModel.tsx     # glTF/GLB loader (normalizes height, plays Idle clip)
    models.ts             # registry: creature id -> /models/*.glb (drop-in)
  ui/
    Shop.tsx, Hud.tsx, SynergyPanel.tsx
```

## Dev tip

In dev the store is exposed as `window.game` (a zustand store), so you can poke state from the
browser console, e.g. `window.game.getState().startBattle()`.

> Note: when this page runs in a *background/headless* browser, `requestAnimationFrame` is
> throttled, so the battle only advances while the tab is actually painting. In a normal
> focused browser tab it runs at 60fps. To step the sim manually:
> `window.game.getState().stepBattle(0.05)`.

## Next steps

1. **Assets**: pipeline is ready — generate the 12 creature `.glb` models (Tripo / Meshy)
   from [`ASSETS.md`](ASSETS.md) and register them in `src/three/models.ts`.
2. **Items**: post-battle item drops, drag onto units for stat bonuses / combinable components.
3. **Abilities**: per-creature specials on a mana bar (the last big combat layer).
4. **Multiplayer**: introduce Colyseus rooms; move `store.ts` logic server-side and stream
   state to clients (learn from the open-source `keldaanCommunity/pokemonAutoChess`).

> IP note: Digimon is Bandai's. Fine for a personal / portfolio / play-with-friends build,
> never commercial. Swap to original creatures if that ever changes.
