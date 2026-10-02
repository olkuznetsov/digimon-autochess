# Roster — 85 forms in 24 lines + 3 wild + 4 bosses, 100% real animated models

Every form has an animated model: source `models-src/<formId>.glb`, shipped (optimized by `npm run optimize-models`) as `public/models/<formId>.glb` (idle/move/attack01… clips
drive the combat state machine). The roster is deliberately shaped around sourceable models.
To add a form: convert with `python3 scripts/convert_model.py <src.fbx> <formid>` and add it
to `src/game/creatures.ts` — the model registry picks it up by convention.

Legend: (V)accine (D)ata (Vi)rus · **[a | b]** = player chooses a branch.

| Line (cost) | Rookie | Champion | Ultimate | Family |
|---|---|---|---|---|
| Agumon (1) | `agumon`(V) | **[`greymon`(V) \| `geogreymon`(V)]** | `greymon` → **[`wargreymon`(V) \| `blitzgreymon`(Vi)]**, `geogreymon` → **[`rizegreymon`(Vi) \| `shinegreymon`(V)]** | Dragon's Roar |
| Tentomon (1) | `tentomon`(V) | `kabuterimon`(V) | **[`megakabuterimon`(D) \| `herculeskabuterimon`(V)]** | Wind Guardians |
| Biyomon (1) | `biyomon`(V) | `birdramon`(V) | **[`garudamon`(V) \| `hououmon`(V)]** | Wind Guardians |
| Terriermon (1) | `terriermon`(V) | `gargomon`(V) | **[`rapidmon`(V) \| `megagargomon`(V)]** | Deep Savers |
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
| Gaomon (2) | `gaomon`(D) | `gaogamon`(D) | **[`machgaogamon`(D) \| `miragegaogamon`(D)]** | Deep Savers |
| Falcomon (2) | `falcomon`(Vi) | `peckmon`(Vi) | **[`crowmon`(D) \| `ravemon`(Vi)]** | Nightmare Soldiers |
| Herissmon (2) | `herissmon`(D) | `filmon`(D) | `rasenmon`(D) | Nightmare Soldiers |
| Wormmon (3) | `wormmon`(V) | `stingmon`(V) | `banchostingmon`(V) | Wind Guardians |
| Renamon (3) | `renamon`(D) | `kyubimon`(D) | **[`taomon`(D) \| `sakuyamon`(D)]** | Nature Spirits |
| Flamemon (3) | `flamemon`(D) | `aldamon`(D) | `susanoomon`(D) | Dragon's Roar |
| Guilmon (4) | `guilmon`(Vi) | `growlmon`(Vi) | `gallantmon`(Vi) | Dragon's Roar |
| Dorumon (4) | `dorumon`(D) | `dorugamon`(D) | `alphamon`(D) | Dragon's Roar |
| Agunimon (4) | `agunimon`(Vi) | `burninggreymon`(Vi) | `kaisergreymon`(Vi) | Dragon's Roar |
| Lobomon (4) | `lobomon`(Vi) | `kendogarurumon`(Vi) | `magnagarurumon`(Vi) | Nature Spirits |

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

Wild Digimon (`wild`: met in PvE waves, never recruited): `coronamon`(V), `tapirmon`(V) rookies; `piximon`(D) champion.

DigiChess is now used up; its Herissmon → Filmon → Rasenmon (a real line from Digimon ReArise) is recruitable since set 4.

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
