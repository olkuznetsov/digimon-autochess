# Creature model checklist — full branching roster (59 Digimon)

Stages: **Rookie (1★) → Champion (2★) → Ultimate (3★)**. Combining 3 of a form lets you
**choose** the next branch. Models are optional — any form without one uses the animated
procedural fallback, so the whole tree is already playable.

## How to register
- Best source: **akennedy007's [Digimon Linkz collection](https://sketchfab.com/akennedy007/collections/digimon-linkz-32d3acdc57da4cd5ac4a69ba3c8c3fc5)** (matching style + `idle`/`move`/`attack01` clips). Gaps: Sketchfab **Animated** filter.
- Save the **GLB** in `public/models/` named by the **form id** (the lowercase id below), e.g. `greymon.glb`.
- Tell me which files landed — I register them in `src/three/models.ts` (keyed by form id) + add CC-BY credit + verify.

Legend: ✅ have it · (V)accine (D)ata (Vi)rus · `id` = filename to save as.

## Lines

**Agumon** · Dragon's Roar
`agumon`✅(V) → `greymon`(V)→`metalgreymon`(V) · `geogreymon`(V)→`risegreymon`(V) · `tyrannomon`(D)→`metaltyrannomon`(Vi)

**Gabumon** · Nature Spirits
`gabumon`(D) → `garurumon`(D)→[`weregarurumon`(D), `metalgarurumon`(D)] · `gaogamon`(D)→`machgaogamon`(D)

**DemiDevimon** · Nightmare Soldiers
`demidevimon`(Vi) → `devimon`(Vi)→[`myotismon`(Vi), `skullsatamon`(Vi)] · `icedevimon`(Vi)→`skullsatamon`

**Patamon** · Wind Guardians
`patamon`(V) → `angemon`(V)→`magnaangemon`(V) · `pegasusmon`(V)→`magnaangemon`

**Tentomon** · Nature Spirits
`tentomon`(D) → `kabuterimon`(D)→[`megakabuterimon`(D), `atlurkabuterimon`(D)] · `kuwagamon`(Vi)→`okuwamon`(Vi)

**Betamon** · Deep Savers
`betamon`(Vi) → `seadramon`(Vi)→[`megaseadramon`(Vi), `metalseadramon`(Vi)] · `gesomon`(Vi)→`marinedevimon`(Vi)

**Bakemon** · Nightmare Soldiers
`bakemon`(Vi) → `soulmon`(Vi)→`phantomon`(Vi) · `devidramon`(Vi)→`phantomon`

**Biyomon** · Wind Guardians
`biyomon`(V) → `birdramon`(V)→`garudamon`(V) · `saberdramon`(Vi)→`hippogriffomon`(Vi)

**Palmon** · Nature Spirits
`palmon`(D) → `togemon`(D)→`lillymon`(D) · `woodmon`(D)→`cherrymon`(D)

**Gomamon** · Deep Savers
`gomamon`(V) → `ikkakumon`(V)→`zudomon`(V) · `dolphmon`(V)→`zudomon`

**Hawkmon** · Wind Guardians
`hawkmon`(V) → `aquilamon`(V)→`silphymon`(V) · `halsemon`(V)→`silphymon`

**Guilmon** · Dragon's Roar (4-cost)
`guilmon`(Vi) → `growlmon`(Vi)→`wargrowlmon`(Vi)

---
Totals: **12 Rookies · 24 Champions · 23 Ultimates = 59**. Names/attributes are pure data in
`src/game/creatures.ts` — tell me any you want changed.
