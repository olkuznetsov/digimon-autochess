# Creature model checklist

Each creature line has 3 stages = star levels in-game:
**1★ Rookie → 2★ Champion → 3★ Ultimate** (you combine 3 of a star to evolve).

## Best source — keep the style consistent

Start with **akennedy007's "Digimon Linkz" collection** (the same ripper as our Agumon):
https://sketchfab.com/akennedy007/collections/digimon-linkz-32d3acdc57da4cd5ac4a69ba3c8c3fc5

These share an art style **and** the same animation clip names (`idle` / `move` / `attack01`),
so they drop straight into the animation state machine. For forms not in that collection,
search Sketchfab with the **Animated** filter and prefer models whose clips are named
`idle` / `move` / `attack` — and roughly match the Linkz look so the roster stays cohesive.

## How to save & register

1. Download the **GLB** for each form.
2. Save it in `public/models/` named by the **form, lowercase, no spaces** — e.g.
   `greymon.glb`, `metalgreymon.glb`, `wargrowlmon.glb`.
3. Tell me which files are in `public/models/` and I'll register them all in
   `src/three/models.ts` (keyed by base creature + star) and verify scale/facing.

Registry shape (for reference):
```ts
agumon: { 1: "/models/agumon.glb", 2: "/models/greymon.glb", 3: "/models/metalgreymon.glb" },
```

> Missing stages are fine — a missing star falls back to the lower star's model, then to
> the animated procedural blob. So you can do this gradually.

## The 12 lines (36 forms)

Legend: ✅ already in repo · ⬜ to download · (V)accine / (D)ata / (Vi)rus

| Base id | 1★ Rookie | 2★ Champion | 3★ Ultimate | Attr | Family |
|---|---|---|---|---|---|
| `agumon` | ✅ Agumon | ⬜ Greymon | ⬜ MetalGreymon | V | Dragon's Roar |
| `gabumon` | ⬜ Gabumon | ⬜ Garurumon | ⬜ WereGarurumon | D | Nature Spirits |
| `demidevimon` | ⬜ DemiDevimon | ⬜ Devimon | ⬜ Myotismon | Vi | Nightmare Soldiers |
| `patamon` | ⬜ Patamon | ⬜ Angemon | ⬜ MagnaAngemon | V | Wind Guardians |
| `tentomon` | ⬜ Tentomon | ⬜ Kabuterimon | ⬜ MegaKabuterimon | D | Nature Spirits |
| `betamon` | ⬜ Betamon | ⬜ Seadramon | ⬜ MegaSeadramon | Vi | Deep Savers |
| `bakemon` | ⬜ Bakemon | ⬜ Soulmon | ⬜ Phantomon | Vi | Nightmare Soldiers |
| `biyomon` | ⬜ Biyomon | ⬜ Birdramon | ⬜ Garudamon | V | Wind Guardians |
| `palmon` | ⬜ Palmon | ⬜ Togemon | ⬜ Lillymon | D | Nature Spirits |
| `gomamon` | ⬜ Gomamon | ⬜ Ikkakumon | ⬜ Zudomon | V | Deep Savers |
| `hawkmon` | ⬜ Hawkmon | ⬜ Aquilamon | ⬜ Silphymon | V | Wind Guardians |
| `guilmon` | ⬜ Guilmon | ⬜ Growlmon | ⬜ WarGrowlmon | Vi | Dragon's Roar |

### Notes on the lines

- These follow the classic **Digimon Adventure** Rookie→Champion→Ultimate lines (Guilmon's is
  from **Tamers**). A few are looser canon and easy to swap if you can't find a model:
  - `demidevimon`: DemiDevimon → Devimon → **Myotismon** (thematic, not a strict line).
  - `bakemon`: Bakemon → Soulmon → **Phantomon** (Nightmare Soldiers ghosts).
  - `hawkmon`: Silphymon is technically a DNA-evolution — substitute freely.
- akennedy007's collection is known to include e.g. **Gabumon, Growlmon, WarGrowlmon** and more;
  grab whatever's there first, then fill gaps elsewhere.
- Whichever form a CC-BY model comes from, add its credit to `CREDITS.md`.
