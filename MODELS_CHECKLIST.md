# Roster — 46 forms, 100% real animated models

Every form has an animated model at `public/models/<formId>.glb` (idle/move/attack01… clips
drive the combat state machine). The roster is deliberately shaped around sourceable models.
To add a form: convert with `python3 scripts/convert_model.py <src.fbx> <formid>` and add it
to `src/game/creatures.ts` — the model registry picks it up by convention.

Legend: (V)accine (D)ata (Vi)rus · **[a | b]** = player chooses a branch.

| Line (cost) | Rookie | Champion | Ultimate | Family |
|---|---|---|---|---|
| Agumon (1) | `agumon`(V) | `greymon`(V) | **[`wargreymon`(V) \| `blitzgreymon`(Vi)]** | Dragon's Roar |
| Gabumon (1) | `gabumon`(D) | `garurumon`(D) | **[`metalgarurumon`(D) \| `cresgarurumon`(V)]** | Nature Spirits |
| DemiDevimon (1) | `demidevimon`(Vi) | `skullsatamon`(Vi) | `belzemon`(Vi) | Nightmare Soldiers |
| Hagurumon (2) | `hagurumon`(Vi) | `guardromon`(Vi) | `machinedramon`(Vi) | Nightmare Soldiers |
| Patamon (2) | `patamon`(V) | `angemon`(V) | `magnaangemon`(V) | Wind Guardians |
| Dracomon (2) | `dracomon`(D) | `coredramon`(D) | `breakdramon`(D) | Nature Spirits |
| Keramon (2) | `keramon`(Vi) | `infermon`(Vi) | `diaboromon`(Vi) | Deep Savers |
| Candlemon (2) | `candlemon`(Vi) | `meramon`(Vi) | `gankoomon`(Vi) | Nightmare Soldiers |
| Palmon (3) | `palmon`(D) | `togemon`(D) | **[`rosemon`(D) \| `rosemonbm`(Vi)]** | Nature Spirits |
| Gomamon (3) | `gomamon`(V) | `ikkakumon`(V) | `vikemon`(V) | Deep Savers |
| Veemon (3) | `veemon`(V) | **[`exveemon`(V) \| `paildramon`(D)]** | `imperialdramon`(V) | Wind Guardians |
| Wormmon (3) | `wormmon`(V) | `stingmon`(V) | `banchostingmon`(V) | Wind Guardians |
| Guilmon (4) | `guilmon`(Vi) | `growlmon`(Vi) | `gallantmon`(Vi) | Dragon's Roar |
| Dorumon (4) | `dorumon`(D) | `dorugamon`(D) | `alphamon`(D) | Dragon's Roar |

Removed (no animated rips exist anywhere): GeoGreymon/RizeGreymon, Tyrannomon/MetalTyrannomon,
Gaogamon/MachGaogamon, WereGarurumon, Devimon/IceDevimon/Myotismon, Pegasusmon,
Woodmon/Cherrymon, Dolphmon. They can return later via Meshy/AI generation.

Unused animated lines still available in the DigiChess source (future "set 2"):
Coronamon→Apollomon, Flamemon→Aldamon→Susanoomon, Herrismon, Tapirmon/Piximon, Zeed, Gracenovamon.
