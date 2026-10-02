# Roster — 49 forms + 6 wild + 4 bosses, 100% real animated models

Every form has an animated model: source `models-src/<formId>.glb`, shipped (optimized by `npm run optimize-models`) as `public/models/<formId>.glb` (idle/move/attack01… clips
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
| Flamemon (3) | `flamemon`(D) | `aldamon`(D) | `susanoomon`(D) | Dragon's Roar |
| Guilmon (4) | `guilmon`(Vi) | `growlmon`(Vi) | `gallantmon`(Vi) | Dragon's Roar |
| Dorumon (4) | `dorumon`(D) | `dorugamon`(D) | `alphamon`(D) | Dragon's Roar |

Removed (no animated rips exist anywhere): GeoGreymon/RizeGreymon, Tyrannomon/MetalTyrannomon,
Gaogamon/MachGaogamon, WereGarurumon, Devimon/IceDevimon/Myotismon, Pegasusmon,
Woodmon/Cherrymon, Dolphmon. They can return later via Meshy/AI generation.

Boss-only (`bossOnly`: never in the shop, wild waves or scrims) — boss rounds draw from candidates:
| Form | Attr / family | Where |
|---|---|---|
| `zeed` ZeedMillenniummon | Vi, Nightmare Soldiers | VS R30 (or Apollomon), endless |
| `gracenovamon` Gracenovamon | D, Dragon's Roar | VS R40+, endless |
| `apollomon` Apollomon | V, Dragon's Roar | solo R15 (or Diaboromon), VS R30, endless |
| `mitamamon` Mitamamon | V, Wind Guardians | solo R10 (or Machinedramon), VS R20, endless |

Wild Digimon (`wild`: met in PvE waves, never recruited): `coronamon`(V), `herissmon`(D), `tapirmon`(V) rookies;
`filmon`(D), `piximon`(D) champions; `rasenmon`(D) mega.

DigiChess is now used up. Herissmon → Filmon → Rasenmon is a real line (Digimon ReArise) and could become a
playable 16th line by moving it from `wild` to a cost + `evolvesTo`.

**The big source is ready: Digimon Story Cyber Sleuth's own files** (see models-src/README.md). 368 models,
46 of them already in the roster; `python3 scripts/dscs_convert.py --list` prints the catalog. Complete lines
we don't have yet include Tentomon → Kabuterimon → MegaKabuterimon/HerculesKabuterimon, Biyomon → Birdramon →
Garudamon/Hououmon, Renamon → Kyubimon → Taomon/Sakuyamon, Terriermon → Gargomon → Rapidmon/MegaGargomon,
Gaomon → GaoGamon → MachGaogamon/MirageGaogamon, Lunamon → Lekismon → Crescemon/Dianamon, Falcomon → Peckmon →
Crowmon/Ravemon, Kudamon → Reppamon → Chirinmon, Hackmon → BaoHuckmon → SaviorHuckmon/Jesmon, the Frontier
spirits (Agunimon → BurningGreymon → KaiserGreymon, Lobomon → KendoGarurumon → MagnaGarurumon) — and the
"removed" ones above (GeoGreymon/RizeGreymon, Tyrannomon/MetalTyrannomon, WereGarurumon, Devimon/Myotismon,
Woodmon/Cherrymon). Tested end to end with GeoGreymon (same look and brightness as the DigiChess Greymon; every
bone within 0.06% of a Blender-made conversion in every clip), Renamon, Gatomon and Omnimon.
