# Roster — 185 forms in 41 lines (16 babies included) + 3 wild + 5 bosses, 100% real animated models

Every form has an animated model: source `models-src/<formId>.glb`, shipped (optimized by `npm run optimize-models`) as `public/models/<formId>.glb` (idle/move/attack01… clips
drive the combat state machine). The roster is deliberately shaped around sourceable models.
To add a form: convert with `python3 scripts/convert_model.py <src.fbx> <formid>` and add it
to `src/game/creatures.ts` — the model registry picks it up by convention.

Legend: (V)accine (D)ata (Vi)rus · **[a | b]** = player chooses a branch · Elements: Cyber Sleuth's, the synergy
axis since Oct 2026 (the line's main one first, then any form that differs).

V3 (branch `v3`, M10): **babies** below Rookie, straight from Cyber Sleuth's evolution table — attribute Free;
Fresh are Neutral, In-Training carry an element as in the game. Fresh (⛂1): `botamon` → [`koromon` | `wanyamon`], `kuramon` → [`tsumemon` | `pagumon`], `pabumon` → [`motimon` | `yokomon` |
`tanemon`], `poyomon` → [`bukamon` | `tokomon`], `punimon` → [`nyaromon` | `tsunomon`]. In-Training (⛂2): `koromon` →
[`agumon` | `guilmon` | `dracomon`], `wanyamon` → [`dorumon` | `gaomon` | `kudamon`], `tsumemon` → [`keramon` | `demidevimon`],
`motimon` → [`hagurumon` | `tentomon` | `gotsumon`], `yokomon` → [`biyomon` | `wormmon`], `tanemon` → [`palmon` | `renamon` | `lalamon` | `fanbeemon`],
`bukamon` → [`gomamon` | `betamon` | `otamamon`], `tokomon` → [`patamon` | `falcomon` | `hawkmon` | `lucemon`], `nyaromon` → [`terriermon` | `salamon` | `lunamon` | `armadillomon`],
`tsunomon` → [`gabumon` | `veemon` | `monodramon` | `goblimon`], `pagumon` → [`impmon` | `chuumon`] (sets 7, 10). Candlemon, Flamemon, Herissmon, Agunimon and Lobomon start at Rookie (no babies in the game).

| Line (cost) | Rookie | Champion | Ultimate | Elements |
|---|---|---|---|---|
| Agumon (1) | `agumon`(V) | **[`greymon`(V) \| `geogreymon`(V)]** | `greymon` → **[`wargreymon`(V) \| `blitzgreymon`(Vi)]**, `geogreymon` → **[`rizegreymon`(Vi) \| `shinegreymon`(V)]** | 🔥 Fire |
| Tentomon (1) | `tentomon`(V) | `kabuterimon`(V) | **[`megakabuterimon`(D) \| `herculeskabuterimon`(V)]** | 🌿 Plant |
| Biyomon (1) | `biyomon`(V) | `birdramon`(V) | **[`garudamon`(V) \| `hououmon`(V)]** | 🌪️ Wind, 🔥 Fire (birdramon) |
| Terriermon (1) | `terriermon`(V) | `gargomon`(V) | **[`rapidmon`(V) \| `megagargomon`(V)]** | 🌪️ Wind, ⚡ Electric (gargomon) |
| Gabumon (1) | `gabumon`(D) | `garurumon`(D) | **[`metalgarurumon`(D) \| `cresgarurumon`(V)]** | 🔥 Fire, 💧 Water (metalgarurumon) |
| DemiDevimon (1) | `demidevimon`(Vi) | **[`skullsatamon`(Vi) \| `devimon`(Vi)]** | `skullsatamon` → `belzemon`(Vi), `devimon` → **[`myotismon`(Vi) \| `ladydevimon`(Vi)]** | 🌑 Dark |
| Hagurumon (2) | `hagurumon`(Vi) | `guardromon`(Vi) | **[`machinedramon`(Vi) \| `andromon`(V)]** | ⚡ Electric |
| Patamon (2) | `patamon`(V) | `angemon`(V) | `magnaangemon`(V) | 🌪️ Wind, ✨ Light (angemon) |
| Dracomon (2) | `dracomon`(D) | `coredramon`(D) | `breakdramon`(D) | 🔥 Fire, ⛰️ Earth (breakdramon) |
| Keramon (2) | `keramon`(Vi) | `infermon`(Vi) | `diaboromon`(Vi) | 🌑 Dark |
| Candlemon (2) | `candlemon`(Vi) | `meramon`(Vi) | `gankoomon`(Vi) | 🔥 Fire |
| Palmon (3) | `palmon`(D) | `togemon`(D) | **[`rosemon`(D) \| `rosemonbm`(Vi)]** | 🌿 Plant |
| Gomamon (3) | `gomamon`(V) | `ikkakumon`(V) | **[`vikemon`(V) \| `zudomon`(V)]** | 💧 Water |
| Veemon (3) | `veemon`(V) | **[`exveemon`(V) \| `paildramon`(D)]** | `imperialdramon`(V) | ⚡ Electric |
| Gaomon (2) | `gaomon`(D) | `gaogamon`(D) | **[`machgaogamon`(D) \| `miragegaogamon`(D)]** | 🌪️ Wind |
| Falcomon (2) | `falcomon`(Vi) | `peckmon`(Vi) | **[`crowmon`(D) \| `ravemon`(Vi)]** | 🌪️ Wind |
| Herissmon (2) | `herissmon`(D) | `filmon`(D) | `rasenmon`(D) | ⚡ Electric |
| Wormmon (3) | `wormmon`(V) | `stingmon`(V) | `banchostingmon`(V) | 🌿 Plant |
| Renamon (3) | `renamon`(D) | `kyubimon`(D) | **[`taomon`(D) \| `sakuyamon`(D)]** | 🌿 Plant, 🔥 Fire (kyubimon), 🌑 Dark (taomon) |
| Salamon (3) | `salamon`(V) | `gatomon`(V) | **[`angewomon`(V) \| `ophanimon`(V) \| `silphymon`(D)]** | ✨ Light |
| Betamon | `betamon`(Vi) | `seadramon`(D) | **[`megaseadramon`(D) \| `metalseadramon`(D)]** | 💧 Water |
| Elecmon | `elecmon`(D) | `leomon`(V) | **[`panjyamon`(V) \| `saberleomon`(D)]** | ⚡ Electric, ⛰️ Earth (leomon), 💧 Water (panjyamon) |
| Mushroomon | `mushroomon`(Vi) | `woodmon`(Vi) | **[`cherrymon`(Vi) \| `puppetmon`(Vi)]** | 🌿 Plant |
| Monodramon | `monodramon`(V) | `strikedramon`(V) | **[`cyberdramon`(Vi) \| `justimon`(V)]** | ⛰️ Earth, 🌑 Dark (cyberdramon) |
| Lunamon | `lunamon`(D) | `lekismon`(D) | **[`crescemon`(D) \| `dianamon`(D)]** | 💧 Water |
| Armadillomon | `armadillomon`(V) | `ankylomon`(V) | **[`shakkoumon`(V) \| `groundramon`(Vi)]** | ⛰️ Earth, ✨ Light (shakkoumon) |
| Gotsumon | `gotsumon`(D) | `golemon`(Vi) | **[`volcanomon`(D) \| `pumpkinmon`(D)]** | ⛰️ Earth, 🔥 Fire (volcanomon) |
| Goblimon | `goblimon`(Vi) | `ogremon`(Vi) | `weregarurumon`(V) | ⛰️ Earth |
| Impmon | `impmon`(Vi) | **[`wizardmon`(D) \| `bakemon`(Vi)]** | `wizardmon` → `wisemon`(Vi), `bakemon` → `phantomon`(Vi) | 🌑 Dark |
| Hawkmon | `hawkmon`(D) | `aquilamon`(D) | **[`hippogryphonmon`(D) \| `aeroveedramon`(V)]** | 🌪️ Wind |
| Kudamon | `kudamon`(V) | `reppamon`(V) | `chirinmon`(V) | ✨ Light |
| Lalamon | `lalamon`(D) | `sunflowmon`(D) | `lilamon`(D) | 🌿 Plant |
| Otamamon | `otamamon`(Vi) | `gekomon`(Vi) | **[`shogungekomon`(Vi) \| `whamon`(V)]** | 💧 Water |
| Chuumon | `chuumon`(Vi) | **[`sukamon`(Vi) \| `numemon`(D)]** | `sukamon` → `etemon`(Vi), `numemon` → **[`etemon` \| `monzaemon`(V)]** | ⛰️ Earth, 🌑 Dark (etemon), ✨ Light (monzaemon) |
| Lucemon | `lucemon`(V) | **[`angemon` \| `devimon`]** (Patamon's and DemiDevimon's champions) | theirs | ✨ Light |
| FanBeemon | `fanbeemon`(D) | `waspmon`(V) | `cannonbeemon`(Vi) | 🌿 Plant, ⚡ Electric (waspmon) |

Set 8 also gives our lines the anime's missing finals: `greymon` → +`metalgreymon`(V, 🔥), `geogreymon` →
+`skullgreymon`(Vi, 🌑), `growlmon` → +`wargrowlmon`(Vi, 🔥) | +`metaltyrannomon`(Vi, ⚡), `togemon` → +`lillymon`(D, 🌿),
`leomon` → +`grapleomon`(V, ⚡).

Set 9 — the anime's own finals as branches: `garurumon` → +`weregarurumon` (also Ogremon's) | +`omnimon`(V, ✨; also
Greymon's, as WarGreymon + MetalGarurumon), `aquilamon` → +`silphymon` (also Gatomon's, the DNA), `meramon` →
+`skullmeramon`(D, 🔥), `dorugamon` → +`dorugreymon`(D, 🔥), `angemon` → +`seraphimon`(V, ✨), `gatomon` →
+`magnadramon`(V, ✨), `exveemon` → +`magnamon`(Vi — Free in the game, Virus for the Mega triangle; ⛰️). A final with two parents is still one Digimon (like
Imperialdramon from ExVeemon or Paildramon).

Set 10 branches: `gargomon` → +`antylamon`(D, 🌪️ — Neutral in the game), `guardromon` → +`datamon`(Vi, ⚡), `stingmon` |
`exveemon` → +`dinobeemon`(D, 🌿 — V-Tamer's DNA of the two). Numemon (D) and Waspmon (V) are flipped from Virus and
FanBeemon (D) too, so each stage keeps its triangle; Monzaemon is Light (Neutral in the game).
| Flamemon (3) | `flamemon`(D) | `aldamon`(D) | `susanoomon`(D) | 🔥 Fire, ✨ Light (susanoomon) |
| Guilmon (4) | `guilmon`(Vi) | `growlmon`(Vi) | `gallantmon`(Vi) | 🔥 Fire, ✨ Light (gallantmon) |
| Dorumon (4) | `dorumon`(D) | `dorugamon`(D) | `alphamon`(D) | ⛰️ Earth |
| Agunimon (4) | `agunimon`(Vi) | `burninggreymon`(Vi) | `kaisergreymon`(Vi) | 🔥 Fire |
| Lobomon (4) | `lobomon`(Vi) | `kendogarurumon`(Vi) | `magnagarurumon`(Vi) | ✨ Light |

Removed early on (no animated rips existed then): GeoGreymon/RizeGreymon, Tyrannomon/MetalTyrannomon,
Gaogamon/MachGaogamon, WereGarurumon, Devimon/IceDevimon/Myotismon, Pegasusmon,
Woodmon/Cherrymon, Dolphmon. Cyber Sleuth's files have them all: GeoGreymon/RizeGreymon, Gaogamon/MachGaogamon
and Devimon/Myotismon are back since sets 4–5, Woodmon/Cherrymon since set 6, WereGarurumon and Bakemon since set 7.

Boss-only (`bossOnly`: never in the shop, wild waves or scrims) — boss rounds draw from candidates:
| Form | Attr / element | Where |
|---|---|---|
| `zeed` ZeedMillenniummon | Vi, Dark | VS R30 (or Apollomon), endless |
| `gracenovamon` Gracenovamon | D, Light | VS R40+ (or Piedmon), endless |
| `apollomon` Apollomon | V, Fire | solo R15 (or Diaboromon), VS R30, endless |
| `mitamamon` Mitamamon | V, Electric | solo R10 (or Machinedramon), VS R20, endless |
| `piedmon` Piedmon | Vi, Dark | solo R15 (or Diaboromon/Apollomon; with Devimon and Bakemon), VS R40+ (or Gracenovamon; with the other Dark Masters — Puppetmon, MetalSeadramon, Machinedramon), endless |

Wild Digimon (`wild`: met in PvE waves, never recruited): `coronamon`(V), `tapirmon`(V) rookies; `piximon`(D) champion.

DigiChess is now used up; its Herissmon → Filmon → Rasenmon (a real line from Digimon ReArise) is recruitable since set 4.

**The big source is ready: Digimon Story Cyber Sleuth's own files** (see models-src/README.md). 368 models,
87 of them in the roster now; `python3 scripts/dscs_convert.py --list` prints the catalog. Complete lines
we don't have yet include Tentomon → Kabuterimon → MegaKabuterimon/HerculesKabuterimon, Biyomon → Birdramon →
Garudamon/Hououmon, Renamon → Kyubimon → Taomon/Sakuyamon, Terriermon → Gargomon → Rapidmon/MegaGargomon,
Gaomon → GaoGamon → MachGaogamon/MirageGaogamon, Lunamon → Lekismon → Crescemon/Dianamon, Falcomon → Peckmon →
Crowmon/Ravemon, Kudamon → Reppamon → Chirinmon, Hackmon → BaoHuckmon → SaviorHuckmon/Jesmon, the Frontier
spirits (Agunimon → BurningGreymon → KaiserGreymon, Lobomon → KendoGarurumon → MagnaGarurumon) — and the
"removed" ones above (GeoGreymon/RizeGreymon, Tyrannomon/MetalTyrannomon, WereGarurumon, Devimon/Myotismon,
Woodmon/Cherrymon). Tested end to end with GeoGreymon (same look and brightness as the DigiChess Greymon; every
bone within 0.06% of a Blender-made conversion in every clip), Renamon, Gatomon and Omnimon.
