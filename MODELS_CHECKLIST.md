# Creature model checklist (branching digivolution)

Stages climb the real Digimon ladder: **Rookie (1★) → Champion (2★) → Ultimate (3★)**.
Evolution **branches** — combining 3 of a form lets you *choose* which next form to become.
Branches can differ in Attribute/Family, so the choice is a strategic one.

We build & download **one line at a time** (each line needs all its branch models).

## Source & how to register

- Best source: **akennedy007's [Digimon Linkz collection](https://sketchfab.com/akennedy007/collections/digimon-linkz-32d3acdc57da4cd5ac4a69ba3c8c3fc5)**
  — matching style + animation clips (`idle`/`move`/`attack01`). Fill gaps via Sketchfab's **Animated** filter.
- Download the **GLB**, save in `public/models/` named by the form, lowercase: `greymon.glb`, `metalgreymon.glb`.
- Tell me which files you dropped in — I register them in `src/three/models.ts` (keyed by form id), add CC-BY credit, verify scale/facing.
- Add each model's credit to `CREDITS.md`.

---

## Line 1 — Agumon  ← build/download first

```
Agumon (V, Dragon's Roar) ✅
 ├─ Greymon (V)      → MetalGreymon (V)
 ├─ GeoGreymon (V)   → RizeGreymon (V)
 └─ Tyrannomon (D)   → MetalTyrannomon (Vi)
```

Download (6): ⬜ `greymon` ⬜ `metalgreymon` ⬜ `geogreymon` ⬜ `risegreymon`
⬜ `tyrannomon` ⬜ `metaltyrannomon`  *(MetalTyrannomon, Growlmon, WarGrowlmon are confirmed in the collection.)*

---

## Remaining Rookies (branches TBD per line as we build them)

We'll define 2–3 branches for each of these the same way, one line per build step.
Canonical "main path" shown for reference; we'll add the alternate branches when we get to each:

| Rookie | main-path Champion | main-path Ultimate | Attr · Family |
|---|---|---|---|
| Gabumon | Garurumon | WereGarurumon | D · Nature Spirits |
| DemiDevimon | Devimon | Myotismon | Vi · Nightmare Soldiers |
| Patamon | Angemon | MagnaAngemon | V · Wind Guardians |
| Tentomon | Kabuterimon | MegaKabuterimon | D · Nature Spirits |
| Betamon | Seadramon | MegaSeadramon | Vi · Deep Savers |
| Bakemon | Soulmon | Phantomon | Vi · Nightmare Soldiers |
| Biyomon | Birdramon | Garudamon | V · Wind Guardians |
| Palmon | Togemon | Lillymon | D · Nature Spirits |
| Gomamon | Ikkakumon | Zudomon | V · Deep Savers |
| Hawkmon | Aquilamon | Silphymon | V · Wind Guardians |
| Guilmon | Growlmon | WarGrowlmon | Vi · Dragon's Roar |

> Tip: while downloading, grab alternate Champions you like for any Rookie (e.g. Gabumon also
> goes to Saberdramon/Garurumon variants) — more branch options = more strategic choices.
