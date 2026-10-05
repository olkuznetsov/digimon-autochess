import type { Attribute, Element, Form, Role, Stage } from "./types";

// The digivolution graph, five stages deep: Fresh → In-Training → Rookie → Champion →
// Mega. A form's stage is its shop price (1–5); combine 3 to evolve up the branches in
// `evolvesTo` (>1 option = the player chooses). Fresh, In-Training and Rookies are
// always in the shop; Champions and Megas once raised this game (discovery).
// EVERY form has a real animated model (see src/three/models.ts) — the roster is
// shaped around the models we could source, by design. Branch options diverge in
// attribute/role so the choice is strategic. Elements are Cyber Sleuth's own.

const f = (
  id: string,
  name: string,
  stage: Stage,
  attribute: Attribute,
  element: Element,
  role: Role,
  extra: { evolvesTo?: string[]; bossOnly?: boolean; wild?: boolean } = {},
): Form => ({ id, name, stage, attribute, element, role, ...extra });

/** a Fresh or In-Training form: no attribute (Cyber Sleuth gives them none); its element is
 *  the game's — most Fresh are Neutral */
const baby = (id: string, name: string, stage: 1 | 2, element: Element, role: Role, evolvesTo: string[]): Form =>
  f(id, name, stage, "Free", element, role, { evolvesTo });

export const FORMS: Record<string, Form> = {
  // ============ Fresh (stage 1) and In-Training (stage 2) — Cyber Sleuth's babies ============
  // The game's own evolution table, cut to the branches that reach our roster (Pagumon
  // leads only to Digimon we don't have). Candlemon, Flamemon, Herissmon and the Frontier
  // spirits have no babies there: their lines start at Rookie.
  botamon: baby("botamon", "Botamon", 1, "Neutral", "bruiser", ["koromon", "wanyamon"]),
  kuramon: baby("kuramon", "Kuramon", 1, "Neutral", "assassin", ["tsumemon", "pagumon"]),
  pabumon: baby("pabumon", "Pabumon", 1, "Neutral", "ranged", ["motimon", "yokomon", "tanemon"]),
  poyomon: baby("poyomon", "Poyomon", 1, "Neutral", "caster", ["bukamon", "tokomon"]),
  punimon: baby("punimon", "Punimon", 1, "Neutral", "tank", ["nyaromon", "tsunomon"]),
  koromon: baby("koromon", "Koromon", 2, "Fire", "bruiser", ["agumon", "guilmon", "dracomon", "hackmon", "toyagumon"]),
  wanyamon: baby("wanyamon", "Wanyamon", 2, "Wind", "bruiser", ["dorumon", "gaomon", "kudamon"]),
  tsumemon: baby("tsumemon", "Tsumemon", 2, "Dark", "assassin", ["keramon", "demidevimon", "dracmon"]),
  motimon: baby("motimon", "Motimon", 2, "Neutral", "caster", ["hagurumon", "tentomon", "gotsumon"]),
  yokomon: baby("yokomon", "Yokomon", 2, "Plant", "caster", ["biyomon", "wormmon", "elecmon", "mushroomon"]),
  tanemon: baby("tanemon", "Tanemon", 2, "Plant", "tank", ["palmon", "renamon", "lalamon", "fanbeemon"]),
  bukamon: baby("bukamon", "Bukamon", 2, "Water", "ranged", ["gomamon", "betamon", "otamamon", "syakomon"]),
  tokomon: baby("tokomon", "Tokomon", 2, "Neutral", "assassin", ["patamon", "falcomon", "hawkmon", "lucemon", "sistermonblanc"]),
  nyaromon: baby("nyaromon", "Nyaromon", 2, "Light", "assassin", ["terriermon", "salamon", "lunamon", "armadillomon"]),
  tsunomon: baby("tsunomon", "Tsunomon", 2, "Earth", "tank", ["gabumon", "veemon", "monodramon", "goblimon", "zubamon"]),
  pagumon: baby("pagumon", "Pagumon", 2, "Dark", "caster", ["impmon", "chuumon", "gazimon"]),

  // ============ Agumon — Dragon's Roar (branch at Ultimate) ============
  agumon: f("agumon", "Agumon", 3, "Vaccine", "Fire", "bruiser", { evolvesTo: ["greymon", "geogreymon", "tyrannomon"] }),
  greymon: f("greymon", "Greymon", 4, "Vaccine", "Fire", "bruiser", { evolvesTo: ["wargreymon", "blitzgreymon", "metalgreymon", "omnimon"] }),
  wargreymon: f("wargreymon", "WarGreymon", 5, "Vaccine", "Fire", "bruiser"),
  blitzgreymon: f("blitzgreymon", "BlitzGreymon", 5, "Virus", "Fire", "ranged"),

  // ============ Gabumon — Nature Spirits (branch at Ultimate) ============
  gabumon: f("gabumon", "Gabumon", 3, "Data", "Fire", "bruiser", { evolvesTo: ["garurumon", "frigimon"] }),
  garurumon: f("garurumon", "Garurumon", 4, "Data", "Fire", "bruiser", { evolvesTo: ["metalgarurumon", "cresgarurumon", "weregarurumon", "omnimon"] }),
  metalgarurumon: f("metalgarurumon", "MetalGarurumon", 5, "Data", "Water", "ranged"),
  cresgarurumon: f("cresgarurumon", "CresGarurumon", 5, "Vaccine", "Water", "bruiser"),

  // ============ DemiDevimon — Nightmare Soldiers (branch at Champion) ============
  demidevimon: f("demidevimon", "DemiDevimon", 3, "Virus", "Dark", "caster", { evolvesTo: ["skullsatamon", "devimon"] }),
  skullsatamon: f("skullsatamon", "SkullSatamon", 4, "Virus", "Dark", "assassin", { evolvesTo: ["belzemon", "creepymon"] }),
  belzemon: f("belzemon", "Beelzemon", 5, "Virus", "Dark", "ranged"),

  // ============ Hagurumon — Nightmare Soldiers ============
  hagurumon: f("hagurumon", "Hagurumon", 3, "Virus", "Electric", "tank", { evolvesTo: ["guardromon", "platinumsukamon"] }),
  guardromon: f("guardromon", "Guardromon", 4, "Virus", "Electric", "tank", { evolvesTo: ["machinedramon", "andromon", "datamon", "chaosdramon"] }),
  machinedramon: f("machinedramon", "Machinedramon", 5, "Virus", "Electric", "ranged"),

  // ============ Patamon — Wind Guardians ============
  patamon: f("patamon", "Patamon", 3, "Vaccine", "Wind", "ranged", { evolvesTo: ["angemon", "unimon"] }),
  angemon: f("angemon", "Angemon", 4, "Vaccine", "Light", "ranged", { evolvesTo: ["magnaangemon", "seraphimon"] }),
  magnaangemon: f("magnaangemon", "MagnaAngemon", 5, "Vaccine", "Light", "assassin"),

  // ============ Dracomon — Nature Spirits ============
  dracomon: f("dracomon", "Dracomon", 3, "Data", "Fire", "tank", { evolvesTo: ["coredramon"] }),
  coredramon: f("coredramon", "Coredramon", 4, "Data", "Fire", "bruiser", { evolvesTo: ["breakdramon"] }),
  breakdramon: f("breakdramon", "Breakdramon", 5, "Data", "Earth", "tank"),

  // ============ Keramon — Deep Savers ============
  keramon: f("keramon", "Keramon", 3, "Virus", "Dark", "caster", { evolvesTo: ["infermon"] }),
  infermon: f("infermon", "Infermon", 4, "Virus", "Dark", "assassin", { evolvesTo: ["diaboromon", "armageddemon"] }),
  diaboromon: f("diaboromon", "Diaboromon", 5, "Virus", "Dark", "tank"),

  // ============ Candlemon — Nightmare Soldiers ============
  candlemon: f("candlemon", "Candlemon", 3, "Virus", "Fire", "caster", { evolvesTo: ["meramon"] }),
  meramon: f("meramon", "Meramon", 4, "Virus", "Fire", "bruiser", { evolvesTo: ["gankoomon", "skullmeramon", "boltmon"] }),
  gankoomon: f("gankoomon", "Gankoomon", 5, "Virus", "Fire", "bruiser"),

  // ============ Palmon — Nature Spirits (branch at Ultimate) ============
  palmon: f("palmon", "Palmon", 3, "Data", "Plant", "caster", { evolvesTo: ["togemon", "vegiemon"] }),
  togemon: f("togemon", "Togemon", 4, "Data", "Plant", "caster", { evolvesTo: ["rosemon", "rosemonbm", "lillymon"] }),
  rosemon: f("rosemon", "Rosemon", 5, "Data", "Plant", "ranged"),
  rosemonbm: f("rosemonbm", "Rosemon BM", 5, "Virus", "Plant", "caster"),

  // ============ Gomamon — Deep Savers ============
  gomamon: f("gomamon", "Gomamon", 3, "Vaccine", "Water", "tank", { evolvesTo: ["ikkakumon", "icemon"] }),
  ikkakumon: f("ikkakumon", "Ikkakumon", 4, "Vaccine", "Water", "tank", { evolvesTo: ["vikemon", "zudomon", "marineangemon"] }),
  vikemon: f("vikemon", "Vikemon", 5, "Vaccine", "Water", "tank"),

  // ============ Veemon — Wind Guardians (branch at Champion) ============
  veemon: f("veemon", "Veemon", 3, "Vaccine", "Electric", "bruiser", { evolvesTo: ["exveemon", "paildramon", "veedramon", "flamedramon"] }),
  exveemon: f("exveemon", "ExVeemon", 4, "Vaccine", "Electric", "bruiser", { evolvesTo: ["imperialdramon", "magnamon", "dinobeemon"] }),
  paildramon: f("paildramon", "Paildramon", 4, "Data", "Electric", "ranged", { evolvesTo: ["imperialdramon"] }),
  imperialdramon: f("imperialdramon", "Imperialdramon", 5, "Vaccine", "Electric", "ranged"),

  // ============ Wormmon — Wind Guardians ============
  wormmon: f("wormmon", "Wormmon", 3, "Vaccine", "Plant", "caster", { evolvesTo: ["stingmon", "hudiemon"] }),
  stingmon: f("stingmon", "Stingmon", 4, "Vaccine", "Plant", "assassin", { evolvesTo: ["banchostingmon", "dinobeemon"] }),
  banchostingmon: f("banchostingmon", "BanchoStingmon", 5, "Vaccine", "Plant", "assassin"),

  // ============ Guilmon — Dragon's Roar ============
  guilmon: f("guilmon", "Guilmon", 3, "Virus", "Fire", "bruiser", { evolvesTo: ["growlmon"] }),
  growlmon: f("growlmon", "Growlmon", 4, "Virus", "Fire", "bruiser", { evolvesTo: ["gallantmon", "wargrowlmon", "metaltyrannomon", "megidramon"] }),
  gallantmon: f("gallantmon", "Gallantmon", 5, "Virus", "Light", "bruiser"),

  // ============ Dorumon — Dragon's Roar ============
  dorumon: f("dorumon", "Dorumon", 3, "Data", "Earth", "bruiser", { evolvesTo: ["dorugamon", "raptordramon"] }),
  dorugamon: f("dorugamon", "Dorugamon", 4, "Data", "Earth", "bruiser", { evolvesTo: ["alphamon", "dorugreymon", "dorugoramon"] }),
  alphamon: f("alphamon", "Alphamon", 5, "Data", "Earth", "bruiser"),

  // ============ Flamemon — Dragon's Roar (set 2, Frontier's warrior of flame) ============
  flamemon: f("flamemon", "Flamemon", 3, "Data", "Fire", "bruiser", { evolvesTo: ["aldamon"] }),
  aldamon: f("aldamon", "Aldamon", 4, "Data", "Fire", "caster", { evolvesTo: ["susanoomon"] }),
  susanoomon: f("susanoomon", "Susanoomon", 5, "Data", "Light", "bruiser"),

  // ---- set 4: straight from Digimon Story Cyber Sleuth's files (scripts/dscs_convert.py);
  // attributes as the game has them, except where the triangle needed it: the Frontier hybrids
  // (none there) and the Falcomon line, RizeGreymon (Virus); Crowmon, MegaKabuterimon — the red
  // AtlurKabuterimon of the wider canon — (Data). Otherwise a Vaccine-heavy roster favours Data.

  // ============ Agumon's second branch — Dragon's Roar (Data Squad) ============
  geogreymon: f("geogreymon", "GeoGreymon", 4, "Vaccine", "Fire", "bruiser", { evolvesTo: ["rizegreymon", "shinegreymon", "skullgreymon", "gaiomon"] }),
  rizegreymon: f("rizegreymon", "RizeGreymon", 5, "Virus", "Fire", "ranged"),
  shinegreymon: f("shinegreymon", "ShineGreymon", 5, "Vaccine", "Light", "bruiser"),

  // ============ Tentomon — Wind Guardians (branch at Ultimate) ============
  tentomon: f("tentomon", "Tentomon", 3, "Vaccine", "Plant", "ranged", { evolvesTo: ["kabuterimon", "kuwagamon"] }),
  kabuterimon: f("kabuterimon", "Kabuterimon", 4, "Vaccine", "Plant", "ranged", { evolvesTo: ["megakabuterimon", "herculeskabuterimon", "tyrantkabuterimon"] }),
  megakabuterimon: f("megakabuterimon", "MegaKabuterimon", 5, "Data", "Plant", "tank"),
  herculeskabuterimon: f("herculeskabuterimon", "HerculesKabuterimon", 5, "Vaccine", "Plant", "caster"),

  // ============ Biyomon — Wind Guardians (branch at Ultimate) ============
  biyomon: f("biyomon", "Biyomon", 3, "Vaccine", "Wind", "caster", { evolvesTo: ["birdramon"] }),
  birdramon: f("birdramon", "Birdramon", 4, "Vaccine", "Fire", "ranged", { evolvesTo: ["garudamon", "hououmon", "varodurumon"] }),
  garudamon: f("garudamon", "Garudamon", 5, "Vaccine", "Fire", "bruiser"),
  hououmon: f("hououmon", "Hououmon", 5, "Vaccine", "Fire", "caster"),

  // ============ Terriermon — Deep Savers (branch at Ultimate) ============
  terriermon: f("terriermon", "Terriermon", 3, "Vaccine", "Wind", "ranged", { evolvesTo: ["gargomon"] }),
  gargomon: f("gargomon", "Gargomon", 4, "Vaccine", "Electric", "ranged", { evolvesTo: ["rapidmon", "megagargomon", "antylamon"] }),
  rapidmon: f("rapidmon", "Rapidmon", 5, "Vaccine", "Electric", "ranged"),
  megagargomon: f("megagargomon", "MegaGargomon", 5, "Vaccine", "Electric", "tank"),

  // ============ Gaomon — Deep Savers (branch at Ultimate) ============
  gaomon: f("gaomon", "Gaomon", 3, "Data", "Wind", "bruiser", { evolvesTo: ["gaogamon"] }),
  gaogamon: f("gaogamon", "GaoGamon", 4, "Data", "Wind", "bruiser", { evolvesTo: ["machgaogamon", "miragegaogamon", "bancholeomon", "chaosmon"] }),
  machgaogamon: f("machgaogamon", "MachGaogamon", 5, "Data", "Wind", "bruiser"),
  miragegaogamon: f("miragegaogamon", "MirageGaogamon", 5, "Data", "Wind", "ranged"),

  // ============ Falcomon — Nightmare Soldiers (branch at Ultimate) ============
  falcomon: f("falcomon", "Falcomon", 3, "Virus", "Wind", "assassin", { evolvesTo: ["peckmon"] }),
  peckmon: f("peckmon", "Peckmon", 4, "Virus", "Wind", "assassin", { evolvesTo: ["crowmon", "ravemon", "minervamon"] }),
  crowmon: f("crowmon", "Crowmon", 5, "Data", "Wind", "caster"),
  ravemon: f("ravemon", "Ravemon", 5, "Virus", "Wind", "assassin"),

  // ============ Herissmon — Nightmare Soldiers (Digimon ReArise) ============
  herissmon: f("herissmon", "Herissmon", 3, "Data", "Electric", "assassin", { evolvesTo: ["filmon"] }),
  filmon: f("filmon", "Filmon", 4, "Data", "Electric", "assassin", { evolvesTo: ["rasenmon"] }),
  rasenmon: f("rasenmon", "Rasenmon", 5, "Data", "Electric", "bruiser"),

  // ============ Renamon — Nature Spirits (branch at Ultimate) ============
  renamon: f("renamon", "Renamon", 3, "Data", "Plant", "assassin", { evolvesTo: ["kyubimon", "turuiemon"] }),
  kyubimon: f("kyubimon", "Kyubimon", 4, "Data", "Fire", "caster", { evolvesTo: ["taomon", "sakuyamon"] }),
  taomon: f("taomon", "Taomon", 5, "Data", "Dark", "caster"),
  sakuyamon: f("sakuyamon", "Sakuyamon", 5, "Data", "Light", "assassin"),

  // ============ Agunimon — Dragon's Roar (Frontier's warrior of flame) ============
  agunimon: f("agunimon", "Agunimon", 3, "Virus", "Fire", "bruiser", { evolvesTo: ["burninggreymon"] }),
  burninggreymon: f("burninggreymon", "BurningGreymon", 4, "Virus", "Fire", "ranged", { evolvesTo: ["kaisergreymon", "dynasmon"] }),
  kaisergreymon: f("kaisergreymon", "KaiserGreymon", 5, "Virus", "Fire", "bruiser"),

  // ============ Lobomon — Nature Spirits (Frontier's warrior of light) ============
  lobomon: f("lobomon", "Lobomon", 3, "Virus", "Light", "assassin", { evolvesTo: ["kendogarurumon"] }),
  kendogarurumon: f("kendogarurumon", "KendoGarurumon", 4, "Virus", "Light", "assassin", { evolvesTo: ["magnagarurumon", "crusadermon"] }),
  magnagarurumon: f("magnagarurumon", "MagnaGarurumon", 5, "Virus", "Light", "ranged"),

  // ============ DemiDevimon's second branch — Nightmare Soldiers (Adventure's Devimon) ============
  devimon: f("devimon", "Devimon", 4, "Virus", "Dark", "caster", { evolvesTo: ["myotismon", "ladydevimon", "lilithmon"] }),
  myotismon: f("myotismon", "Myotismon", 5, "Virus", "Dark", "caster"),
  ladydevimon: f("ladydevimon", "LadyDevimon", 5, "Virus", "Dark", "assassin"),

  // ============ Salamon — Wind Guardians (three-way branch at Ultimate) ============
  salamon: f("salamon", "Salamon", 3, "Vaccine", "Light", "caster", { evolvesTo: ["gatomon"] }),
  gatomon: f("gatomon", "Gatomon", 4, "Vaccine", "Light", "assassin", { evolvesTo: ["angewomon", "ophanimon", "silphymon", "magnadramon"] }),
  angewomon: f("angewomon", "Angewomon", 5, "Vaccine", "Light", "ranged"),
  ophanimon: f("ophanimon", "Ophanimon", 5, "Vaccine", "Light", "caster"),
  silphymon: f("silphymon", "Silphymon", 5, "Data", "Wind", "bruiser"),

  // ---- set 6: Cyber Sleuth's files again — a line for every element; attributes as the game
  // has them, except Cyberdramon (Virus) for the triangle

  // ============ Betamon — Water (Adventure's Seadramon) ============
  betamon: f("betamon", "Betamon", 3, "Virus", "Water", "caster", { evolvesTo: ["seadramon"] }),
  seadramon: f("seadramon", "Seadramon", 4, "Data", "Water", "ranged", { evolvesTo: ["megaseadramon", "metalseadramon", "leviamon"] }),
  megaseadramon: f("megaseadramon", "MegaSeadramon", 5, "Data", "Water", "caster"),
  metalseadramon: f("metalseadramon", "MetalSeadramon", 5, "Data", "Water", "ranged"),

  // ============ Elecmon — Electric → Earth (Leomon) ============
  elecmon: f("elecmon", "Elecmon", 3, "Data", "Electric", "bruiser", { evolvesTo: ["leomon"] }),
  leomon: f("leomon", "Leomon", 4, "Vaccine", "Earth", "bruiser", { evolvesTo: ["panjyamon", "saberleomon", "grapleomon", "leopardmon"] }),
  panjyamon: f("panjyamon", "Panjyamon", 5, "Vaccine", "Water", "bruiser"),
  saberleomon: f("saberleomon", "SaberLeomon", 5, "Data", "Wind", "assassin"),

  // ============ Mushroomon — Plant (the Dark Masters' Puppetmon) ============
  mushroomon: f("mushroomon", "Mushroomon", 3, "Virus", "Plant", "caster", { evolvesTo: ["woodmon", "mudfrigimon"] }),
  woodmon: f("woodmon", "Woodmon", 4, "Virus", "Plant", "tank", { evolvesTo: ["cherrymon", "puppetmon"] }),
  cherrymon: f("cherrymon", "Cherrymon", 5, "Virus", "Plant", "caster"),
  puppetmon: f("puppetmon", "Puppetmon", 5, "Virus", "Plant", "ranged"),

  // ============ Monodramon — Earth (Tamers' Cyberdramon) ============
  monodramon: f("monodramon", "Monodramon", 3, "Vaccine", "Earth", "bruiser", { evolvesTo: ["strikedramon"] }),
  strikedramon: f("strikedramon", "Strikedramon", 4, "Vaccine", "Earth", "assassin", { evolvesTo: ["cyberdramon", "justimon"] }),
  cyberdramon: f("cyberdramon", "Cyberdramon", 5, "Virus", "Dark", "bruiser"),
  justimon: f("justimon", "Justimon", 5, "Vaccine", "Light", "assassin"),

  // ============ Lunamon — Water (Olympos XII's Dianamon) ============
  lunamon: f("lunamon", "Lunamon", 3, "Data", "Water", "caster", { evolvesTo: ["lekismon"] }),
  lekismon: f("lekismon", "Lekismon", 4, "Data", "Water", "ranged", { evolvesTo: ["crescemon", "dianamon", "merukimon"] }),
  crescemon: f("crescemon", "Crescemon", 5, "Data", "Water", "assassin"),
  dianamon: f("dianamon", "Dianamon", 5, "Data", "Water", "caster"),

  // ---- set 7: Cyber Sleuth's files again — Earth (the thinnest element) first, then Dark and
  // Wind; Free in the game's table (Armadillomon, Hawkmon lines) gets an attribute for the triangle

  // ============ Armadillomon — Earth (Adventure 02's Ankylomon and Shakkoumon) ============
  armadillomon: f("armadillomon", "Armadillomon", 3, "Vaccine", "Earth", "tank", { evolvesTo: ["ankylomon", "cyclonemon"] }),
  ankylomon: f("ankylomon", "Ankylomon", 4, "Vaccine", "Earth", "tank", { evolvesTo: ["shakkoumon", "groundramon"] }),
  shakkoumon: f("shakkoumon", "Shakkoumon", 5, "Vaccine", "Light", "caster"),
  groundramon: f("groundramon", "Groundramon", 5, "Virus", "Earth", "bruiser"),

  // ============ Gotsumon — Earth (Golemon; Volcanomon, Pumpkinmon) ============
  gotsumon: f("gotsumon", "Gotsumon", 3, "Data", "Earth", "bruiser", { evolvesTo: ["golemon", "tankmon"] }),
  golemon: f("golemon", "Golemon", 4, "Virus", "Earth", "tank", { evolvesTo: ["volcanomon", "pumpkinmon", "pilevolcamon"] }),
  volcanomon: f("volcanomon", "Volcanomon", 5, "Data", "Fire", "ranged"),
  pumpkinmon: f("pumpkinmon", "Pumpkinmon", 5, "Data", "Earth", "caster"),

  // ============ Goblimon — Earth (Adventure's Ogremon) ============
  goblimon: f("goblimon", "Goblimon", 3, "Virus", "Earth", "bruiser", { evolvesTo: ["ogremon"] }),
  ogremon: f("ogremon", "Ogremon", 4, "Virus", "Earth", "bruiser", { evolvesTo: ["weregarurumon"] }),
  weregarurumon: f("weregarurumon", "WereGarurumon", 5, "Vaccine", "Earth", "assassin"),

  // ============ Impmon — Dark (Tamers; Adventure's Wizardmon and Bakemon) ============
  impmon: f("impmon", "Impmon", 3, "Virus", "Dark", "caster", { evolvesTo: ["wizardmon", "bakemon"] }),
  wizardmon: f("wizardmon", "Wizardmon", 4, "Data", "Dark", "caster", { evolvesTo: ["wisemon", "barbamon"] }),
  bakemon: f("bakemon", "Bakemon", 4, "Virus", "Dark", "assassin", { evolvesTo: ["phantomon", "venommyotismon"] }),
  wisemon: f("wisemon", "Wisemon", 5, "Virus", "Dark", "caster"),
  phantomon: f("phantomon", "Phantomon", 5, "Virus", "Dark", "assassin"),

  // ============ Hawkmon — Wind (Adventure 02's Aquilamon) ============
  hawkmon: f("hawkmon", "Hawkmon", 3, "Data", "Wind", "ranged", { evolvesTo: ["aquilamon", "airdramon"] }),
  aquilamon: f("aquilamon", "Aquilamon", 4, "Data", "Wind", "ranged", { evolvesTo: ["hippogryphonmon", "aeroveedramon", "silphymon", "valkyrimon"] }),
  hippogryphonmon: f("hippogryphonmon", "HippoGryphonmon", 5, "Data", "Wind", "ranged"),
  aeroveedramon: f("aeroveedramon", "AeroVeedramon", 5, "Vaccine", "Wind", "bruiser"),

  // ============ new branches: Ikkakumon → Zudomon, Guardromon → Andromon (as in the anime) ============
  zudomon: f("zudomon", "Zudomon", 5, "Vaccine", "Water", "bruiser"),
  andromon: f("andromon", "Andromon", 5, "Vaccine", "Electric", "bruiser"),

  // ---- set 8: three more lines and the anime's missing finals as branches of our lines

  // ============ Kudamon — Light (Data Squad's Reppamon, Chirinmon) ============
  kudamon: f("kudamon", "Kudamon", 3, "Vaccine", "Light", "ranged", { evolvesTo: ["reppamon"] }),
  reppamon: f("reppamon", "Reppamon", 4, "Vaccine", "Light", "assassin", { evolvesTo: ["chirinmon", "kentaurosmon"] }),
  chirinmon: f("chirinmon", "Chirinmon", 5, "Vaccine", "Light", "caster"),

  // ============ Lalamon — Plant (Data Squad's Sunflowmon, Lilamon) ============
  lalamon: f("lalamon", "Lalamon", 3, "Data", "Plant", "ranged", { evolvesTo: ["sunflowmon"] }),
  sunflowmon: f("sunflowmon", "Sunflowmon", 4, "Data", "Plant", "caster", { evolvesTo: ["lilamon", "lotosmon"] }),
  lilamon: f("lilamon", "Lilamon", 5, "Data", "Plant", "ranged"),

  // ============ Otamamon — Water (Adventure's Gekomon; ShogunGekomon, Whamon) ============
  otamamon: f("otamamon", "Otamamon", 3, "Virus", "Water", "caster", { evolvesTo: ["gekomon"] }),
  gekomon: f("gekomon", "Gekomon", 4, "Virus", "Water", "caster", { evolvesTo: ["shogungekomon", "whamon", "neptunemon"] }),
  shogungekomon: f("shogungekomon", "ShogunGekomon", 5, "Virus", "Water", "tank"),
  whamon: f("whamon", "Whamon", 5, "Vaccine", "Water", "tank"),

  // ============ new branches: the anime's own finals ============
  metalgreymon: f("metalgreymon", "MetalGreymon", 5, "Vaccine", "Fire", "ranged"),
  skullgreymon: f("skullgreymon", "SkullGreymon", 5, "Virus", "Dark", "bruiser"),
  wargrowlmon: f("wargrowlmon", "WarGrowlmon", 5, "Virus", "Fire", "ranged"),
  metaltyrannomon: f("metaltyrannomon", "MetalTyrannomon", 5, "Virus", "Electric", "bruiser"),
  lillymon: f("lillymon", "Lillymon", 5, "Data", "Plant", "ranged"),
  grapleomon: f("grapleomon", "GrapLeomon", 5, "Vaccine", "Electric", "bruiser"),

  // ---- set 9: the anime's own finals as branches — Garurumon → WereGarurumon, Aquilamon →
  // Silphymon (the DNA with Gatomon) and Omnimon (WarGreymon + MetalGarurumon) from either
  // partner, as Imperialdramon already comes from ExVeemon or Paildramon
  skullmeramon: f("skullmeramon", "SkullMeramon", 5, "Data", "Fire", "bruiser"),
  dorugreymon: f("dorugreymon", "DoruGreymon", 5, "Data", "Fire", "bruiser"),
  seraphimon: f("seraphimon", "Seraphimon", 5, "Vaccine", "Light", "caster"),
  magnadramon: f("magnadramon", "Magnadramon", 5, "Vaccine", "Light", "caster"),
  magnamon: f("magnamon", "Magnamon", 5, "Virus", "Earth", "tank"),
  omnimon: f("omnimon", "Omnimon", 5, "Vaccine", "Light", "bruiser"),

  // ---- set 10: Adventure's clowns and villains, Frontier's fallen angel, a swarm for Electric

  // ============ Chuumon — Earth → Dark (Adventure's Sukamon, Numemon, Etemon, Monzaemon) ============
  chuumon: f("chuumon", "Chuumon", 3, "Virus", "Earth", "assassin", { evolvesTo: ["sukamon", "numemon"] }),
  sukamon: f("sukamon", "Sukamon", 4, "Virus", "Earth", "ranged", { evolvesTo: ["etemon", "kingetemon"] }),
  numemon: f("numemon", "Numemon", 4, "Data", "Earth", "tank", { evolvesTo: ["etemon", "monzaemon", "metaletemon"] }),
  etemon: f("etemon", "Etemon", 5, "Virus", "Dark", "caster"),
  // Neutral in the game's table; the bear of love fights for Light here
  monzaemon: f("monzaemon", "Monzaemon", 5, "Vaccine", "Light", "tank"),

  // ============ Lucemon — Light (Frontier): an angel's road or a demon's, into Angemon or Devimon ============
  lucemon: f("lucemon", "Lucemon", 3, "Vaccine", "Light", "caster", { evolvesTo: ["angemon", "devimon"] }),

  // ============ FanBeemon — Plant → Electric (a swarm: Waspmon, CannonBeemon) ============
  fanbeemon: f("fanbeemon", "FanBeemon", 3, "Data", "Plant", "ranged", { evolvesTo: ["waspmon"] }),
  waspmon: f("waspmon", "Waspmon", 4, "Vaccine", "Electric", "ranged", { evolvesTo: ["cannonbeemon", "tigervespamon"] }),
  cannonbeemon: f("cannonbeemon", "CannonBeemon", 5, "Virus", "Electric", "ranged"),

  // ============ new branches: Gargomon → Antylamon (Tamers), Guardromon → Datamon (Adventure),
  // Stingmon or ExVeemon → Dinobeemon (V-Tamer's DNA of the two) ============
  antylamon: f("antylamon", "Antylamon", 5, "Data", "Wind", "assassin"),
  datamon: f("datamon", "Datamon", 5, "Virus", "Electric", "caster"),
  dinobeemon: f("dinobeemon", "Dinobeemon", 5, "Data", "Plant", "assassin"),

  // ---- set 11: the rest of Cyber Sleuth's roster — seven lines, the champions our rookies were
  // missing, and every Ultimate and Mega left as a final (Royal Knights, Demon Lords, Olympos XII,
  // the Mamemon family…). Attributes keep each stage's triangle; the game's Neutral/Free get one.
  // rookies
  hackmon: f("hackmon", "Hackmon", 3, "Data", "Fire", "assassin", { evolvesTo: ["baohuckmon", "monochromon"] }),
  zubamon: f("zubamon", "Zubamon", 3, "Vaccine", "Wind", "bruiser", { evolvesTo: ["zubaeagermon"] }),
  toyagumon: f("toyagumon", "ToyAgumon", 3, "Vaccine", "Electric", "ranged", { evolvesTo: ["clockmon", "starmon"] }),
  dracmon: f("dracmon", "Dracmon", 3, "Virus", "Dark", "assassin", { evolvesTo: ["sangloupmon", "raremon"] }),
  gazimon: f("gazimon", "Gazimon", 3, "Virus", "Dark", "assassin", { evolvesTo: ["kurisarimon", "nanimon"] }),
  sistermonblanc: f("sistermonblanc", "Sistermon Blanc", 3, "Vaccine", "Light", "ranged", { evolvesTo: ["sistermonnoir"] }),
  syakomon: f("syakomon", "Syakomon", 3, "Data", "Water", "tank", { evolvesTo: ["shellnumemon", "coelamon"] }),
  // champions
  airdramon: f("airdramon", "Airdramon", 4, "Vaccine", "Wind", "ranged", { evolvesTo: ["wingdramon", "slayerdramon", "examon"] }),
  baohuckmon: f("baohuckmon", "BaoHuckmon", 4, "Data", "Fire", "bruiser", { evolvesTo: ["saviorhuckmon", "jesmon"] }),
  clockmon: f("clockmon", "Clockmon", 4, "Data", "Electric", "caster", { evolvesTo: ["knightmon", "hiandromon"] }),
  coelamon: f("coelamon", "Coelamon", 4, "Data", "Water", "tank", { evolvesTo: ["dragomon", "plesiomon"] }),
  cyclonemon: f("cyclonemon", "Cyclonemon", 4, "Virus", "Earth", "bruiser", { evolvesTo: ["megadramon", "darkdramon"] }),
  frigimon: f("frigimon", "Frigimon", 4, "Vaccine", "Water", "tank", { evolvesTo: ["zudomon", "monzaemon"] }),
  hudiemon: f("hudiemon", "Hudiemon", 4, "Vaccine", "Plant", "caster", { evolvesTo: ["lillymon", "lilamon"] }),
  icemon: f("icemon", "Icemon", 4, "Data", "Water", "tank", { evolvesTo: ["zudomon", "panjyamon"] }),
  kurisarimon: f("kurisarimon", "Kurisarimon", 4, "Virus", "Dark", "caster", { evolvesTo: ["diaboromon", "cyberdramon"] }),
  kuwagamon: f("kuwagamon", "Kuwagamon", 4, "Virus", "Plant", "assassin", { evolvesTo: ["okuwamon", "grankuwagamon"] }),
  monochromon: f("monochromon", "Monochromon", 4, "Data", "Earth", "tank", { evolvesTo: ["triceramon", "skullgreymon"] }),
  mudfrigimon: f("mudfrigimon", "MudFrigimon", 4, "Data", "Earth", "tank", { evolvesTo: ["pandamon", "pumpkinmon"] }),
  nanimon: f("nanimon", "Nanimon", 4, "Virus", "Earth", "bruiser", { evolvesTo: ["digitamamon", "superstarmon"] }),
  platinumsukamon: f("platinumsukamon", "PlatinumSukamon", 4, "Virus", "Electric", "caster", { evolvesTo: ["vademon", "ebemon", "metalmamemon"] }),
  raptordramon: f("raptordramon", "Raptordramon", 4, "Vaccine", "Electric", "assassin", { evolvesTo: ["grademon", "dorugreymon"] }),
  raremon: f("raremon", "Raremon", 4, "Virus", "Earth", "caster", { evolvesTo: ["dragomon", "titamon"] }),
  sangloupmon: f("sangloupmon", "Sangloupmon", 4, "Virus", "Dark", "assassin", { evolvesTo: ["matadormon", "grandracmon"] }),
  shellnumemon: f("shellnumemon", "ShellNumemon", 4, "Virus", "Water", "tank", { evolvesTo: ["shogungekomon", "megaseadramon"] }),
  sistermonnoir: f("sistermonnoir", "Sistermon Noir", 4, "Virus", "Light", "ranged", { evolvesTo: ["pandamon", "mastemon"] }),
  starmon: f("starmon", "Starmon", 4, "Vaccine", "Light", "ranged", { evolvesTo: ["superstarmon", "mamemon", "catchmamemon", "princemamemon"] }),
  tankmon: f("tankmon", "Tankmon", 4, "Data", "Electric", "ranged", { evolvesTo: ["knightmon", "groundlocomon", "craniamon"] }),
  turuiemon: f("turuiemon", "Turuiemon", 4, "Vaccine", "Earth", "assassin", { evolvesTo: ["antylamon"] }),
  tyrannomon: f("tyrannomon", "Tyrannomon", 4, "Data", "Fire", "bruiser", { evolvesTo: ["metaltyrannomon", "rusttyranomon", "megadramon"] }),
  unimon: f("unimon", "Unimon", 4, "Vaccine", "Wind", "ranged", { evolvesTo: ["hippogryphonmon", "gryphonmon"] }),
  veedramon: f("veedramon", "Veedramon", 4, "Vaccine", "Wind", "bruiser", { evolvesTo: ["aeroveedramon", "ulforceveedramon"] }),
  vegiemon: f("vegiemon", "Vegiemon", 4, "Virus", "Plant", "caster", { evolvesTo: ["digitamamon", "lilamon"] }),
  zubaeagermon: f("zubaeagermon", "ZubaEagermon", 4, "Vaccine", "Wind", "assassin", { evolvesTo: ["duramon", "durandamon"] }),
  flamedramon: f("flamedramon", "Flamedramon", 4, "Vaccine", "Fire", "bruiser", { evolvesTo: ["magnamon"] }),
  // finals
  catchmamemon: f("catchmamemon", "CatchMamemon", 5, "Data", "Electric", "bruiser"),
  digitamamon: f("digitamamon", "Digitamamon", 5, "Data", "Dark", "tank"),
  dragomon: f("dragomon", "Dragomon", 5, "Virus", "Water", "caster"),
  duramon: f("duramon", "Duramon", 5, "Vaccine", "Wind", "assassin"),
  grademon: f("grademon", "Grademon", 5, "Vaccine", "Light", "assassin"),
  knightmon: f("knightmon", "Knightmon", 5, "Data", "Earth", "tank"),
  mamemon: f("mamemon", "Mamemon", 5, "Data", "Earth", "bruiser"),
  matadormon: f("matadormon", "Matadormon", 5, "Virus", "Dark", "assassin"),
  megadramon: f("megadramon", "Megadramon", 5, "Virus", "Wind", "ranged"),
  metalmamemon: f("metalmamemon", "MetalMamemon", 5, "Data", "Electric", "ranged"),
  okuwamon: f("okuwamon", "Okuwamon", 5, "Virus", "Plant", "assassin"),
  pandamon: f("pandamon", "Pandamon", 5, "Data", "Earth", "bruiser"),
  saviorhuckmon: f("saviorhuckmon", "SaviorHuckmon", 5, "Data", "Fire", "bruiser"),
  superstarmon: f("superstarmon", "SuperStarmon", 5, "Data", "Light", "caster"),
  triceramon: f("triceramon", "Triceramon", 5, "Data", "Earth", "tank"),
  vademon: f("vademon", "Vademon", 5, "Virus", "Dark", "caster"),
  wingdramon: f("wingdramon", "Wingdramon", 5, "Vaccine", "Wind", "ranged"),
  bancholeomon: f("bancholeomon", "BanchoLeomon", 5, "Vaccine", "Earth", "bruiser"),
  barbamon: f("barbamon", "Barbamon", 5, "Virus", "Dark", "caster"),
  boltmon: f("boltmon", "Boltmon", 5, "Data", "Electric", "bruiser"),
  chaosdramon: f("chaosdramon", "Chaosdramon", 5, "Virus", "Electric", "ranged"),
  craniamon: f("craniamon", "Craniamon", 5, "Vaccine", "Earth", "tank"),
  creepymon: f("creepymon", "Creepymon", 5, "Virus", "Dark", "caster"),
  crusadermon: f("crusadermon", "Crusadermon", 5, "Vaccine", "Dark", "assassin"),
  darkdramon: f("darkdramon", "Darkdramon", 5, "Virus", "Electric", "ranged"),
  dorugoramon: f("dorugoramon", "Dorugoramon", 5, "Data", "Dark", "bruiser"),
  durandamon: f("durandamon", "Durandamon", 5, "Vaccine", "Wind", "assassin"),
  dynasmon: f("dynasmon", "Dynasmon", 5, "Data", "Wind", "bruiser"),
  ebemon: f("ebemon", "Ebemon", 5, "Virus", "Electric", "caster"),
  gaiomon: f("gaiomon", "Gaiomon", 5, "Virus", "Fire", "assassin"),
  grandracmon: f("grandracmon", "GranDracmon", 5, "Virus", "Dark", "caster"),
  grankuwagamon: f("grankuwagamon", "GranKuwagamon", 5, "Virus", "Plant", "assassin"),
  groundlocomon: f("groundlocomon", "GroundLocomon", 5, "Data", "Electric", "ranged"),
  gryphonmon: f("gryphonmon", "Gryphonmon", 5, "Data", "Wind", "ranged"),
  hiandromon: f("hiandromon", "HiAndromon", 5, "Vaccine", "Electric", "ranged"),
  jesmon: f("jesmon", "Jesmon", 5, "Data", "Light", "assassin"),
  kentaurosmon: f("kentaurosmon", "Kentaurosmon", 5, "Vaccine", "Light", "ranged"),
  kingetemon: f("kingetemon", "KingEtemon", 5, "Virus", "Earth", "caster"),
  leopardmon: f("leopardmon", "Leopardmon", 5, "Data", "Light", "assassin"),
  leviamon: f("leviamon", "Leviamon", 5, "Virus", "Water", "tank"),
  lilithmon: f("lilithmon", "Lilithmon", 5, "Virus", "Dark", "caster"),
  lotosmon: f("lotosmon", "Lotosmon", 5, "Data", "Plant", "caster"),
  marineangemon: f("marineangemon", "MarineAngemon", 5, "Vaccine", "Water", "caster"),
  mastemon: f("mastemon", "Mastemon", 5, "Vaccine", "Light", "caster"),
  megidramon: f("megidramon", "Megidramon", 5, "Virus", "Fire", "bruiser"),
  merukimon: f("merukimon", "Merukimon", 5, "Vaccine", "Wind", "tank"),
  metaletemon: f("metaletemon", "MetalEtemon", 5, "Virus", "Earth", "bruiser"),
  minervamon: f("minervamon", "Minervamon", 5, "Vaccine", "Light", "assassin"),
  neptunemon: f("neptunemon", "Neptunemon", 5, "Vaccine", "Water", "caster"),
  pilevolcamon: f("pilevolcamon", "PileVolcamon", 5, "Data", "Fire", "bruiser"),
  plesiomon: f("plesiomon", "Plesiomon", 5, "Data", "Water", "tank"),
  princemamemon: f("princemamemon", "PrinceMamemon", 5, "Data", "Earth", "bruiser"),
  rusttyranomon: f("rusttyranomon", "RustTyranomon", 5, "Data", "Electric", "bruiser"),
  slayerdramon: f("slayerdramon", "Slayerdramon", 5, "Vaccine", "Wind", "assassin"),
  tigervespamon: f("tigervespamon", "TigerVespamon", 5, "Vaccine", "Electric", "assassin"),
  titamon: f("titamon", "Titamon", 5, "Virus", "Earth", "bruiser"),
  tyrantkabuterimon: f("tyrantkabuterimon", "TyrantKabuterimon", 5, "Virus", "Plant", "tank"),
  ulforceveedramon: f("ulforceveedramon", "UlforceVeedramon", 5, "Vaccine", "Wind", "assassin"),
  valkyrimon: f("valkyrimon", "Valkyrimon", 5, "Vaccine", "Wind", "assassin"),
  varodurumon: f("varodurumon", "Varodurumon", 5, "Vaccine", "Light", "ranged"),
  venommyotismon: f("venommyotismon", "VenomMyotismon", 5, "Virus", "Dark", "tank"),
  armageddemon: f("armageddemon", "Armageddemon", 5, "Virus", "Dark", "tank"),
  chaosmon: f("chaosmon", "Chaosmon", 5, "Vaccine", "Light", "bruiser"),
  examon: f("examon", "Examon", 5, "Data", "Wind", "bruiser"),

  // ============ bosses only ============
  zeed: f("zeed", "ZeedMillenniummon", 5, "Virus", "Dark", "tank", { bossOnly: true }),
  gracenovamon: f("gracenovamon", "Gracenovamon", 5, "Data", "Light", "bruiser", { bossOnly: true }),
  // the Dark Masters' leader: solo R15, VS R40+ (with the other three as his minions), endless
  piedmon: f("piedmon", "Piedmon", 5, "Virus", "Dark", "assassin", { bossOnly: true }),
  // the final boss (Frontier): Falldown Mode, and Satan Mode when he falls — solo R15, VS R40+
  lucemonfm: f("lucemonfm", "Lucemon Falldown Mode", 5, "Virus", "Neutral", "caster", { bossOnly: true }),
  lucemonsm: f("lucemonsm", "Lucemon Satan Mode", 5, "Virus", "Dark", "bruiser", { bossOnly: true }),
  apollomon: f("apollomon", "Apollomon", 5, "Vaccine", "Fire", "caster", { bossOnly: true }),
  mitamamon: f("mitamamon", "Mitamamon", 5, "Vaccine", "Electric", "ranged", { bossOnly: true }),
  // Cyber Sleuth's data-eaters, with mechanics of their own (battle.ts): the Eater devours the
  // weakest of your team (solo R10, endless), the Mother Eater broods Eater Bits that shield
  // her (endless); the Bits and the Legion are their minions
  eater: f("eater", "Eater", 5, "Virus", "Dark", "bruiser", { bossOnly: true }),
  mothereater: f("mothereater", "Mother Eater", 5, "Virus", "Dark", "tank", { bossOnly: true }),
  eaterbit: f("eaterbit", "Eater Bit", 3, "Virus", "Dark", "assassin", { bossOnly: true }),
  eaterlegion: f("eaterlegion", "Eater Legion", 4, "Virus", "Dark", "tank", { bossOnly: true }),

  // ============ wild Digimon (set 3): met in PvE waves, never recruited ============
  coronamon: f("coronamon", "Coronamon", 3, "Vaccine", "Fire", "ranged", { wild: true }),
  tapirmon: f("tapirmon", "Tapirmon", 3, "Vaccine", "Dark", "caster", { wild: true }),
  piximon: f("piximon", "Piximon", 4, "Data", "Light", "caster", { wild: true }),
};

/** Shop tier (= stage) colours: warm and neutral on purpose — green, blue and purple
 *  already mean Vaccine, Data and Virus. Champions glow orange ("epic"), Megas gold. */
export const TIER_COLOR = ["", "#9aa3b5", "#f2a7cf", "#e3ebf7", "#ff9b54", "#ffd34d"] as const;

/** Display names of the five stages (the game's top tier is called Mega throughout). */
export const STAGE_NAME = ["", "Fresh", "In-Training", "Rookie", "Champion", "Mega"] as const;

export const ALL_FORM_IDS = Object.keys(FORMS);
/** The form with this id, for ids from outside (a received board): own keys only, so
 *  "constructor" or "__proto__" aren't mistaken for forms. */
export const formOf = (id: string): Form | undefined =>
  Object.prototype.hasOwnProperty.call(FORMS, id) ? FORMS[id] : undefined;
/** a form a player can own and field (not a boss, not a wild Digimon) */
export const isPlayable = (form: Form | undefined): form is Form => !!form && !form.bossOnly && !form.wild;
export const PLAYABLE_IDS = ALL_FORM_IDS.filter((id) => isPlayable(FORMS[id]));
/** the rookies (stage 3) */
export const ROOKIE_IDS = PLAYABLE_IDS.filter((id) => FORMS[id].stage === 3);
/** wild Digimon, met only in PvE waves */
export const WILD_IDS = ALL_FORM_IDS.filter((id) => FORMS[id].wild);

/** A form with nowhere to digivolve (a Mega): three copies star it up instead. */
export const isTerminal = (formId: string) => !(FORMS[formId]?.evolvesTo?.length);
/** HP and attack by star level (Teamfight Tactics' ×1.8 a star); a ★★★ Mega's ultimate
 *  hits harder on top. */
export const STAR_MULT = [1, 1, 1.8, 3.2];
export const STAR3_ULT = 1.5;

/** A form's shop price: its stage (Fresh 1 … Mega 5). */
export const costOf = (formId: string): number => FORMS[formId]?.stage ?? 1;

/** The rookie each Rookie-or-later form's line starts from. */
export const LINE_ROOT: Record<string, string> = {};
for (const id of ROOKIE_IDS) {
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    LINE_ROOT[cur] = id;
    for (const nxt of FORMS[cur].evolvesTo ?? []) stack.push(nxt);
  }
}

/** Every form a form can digivolve into, however many stages on. */
export const DESCENDANTS: Record<string, Set<string>> = {};
const descend = (id: string): Set<string> => {
  if (DESCENDANTS[id]) return DESCENDANTS[id];
  const out = new Set<string>();
  for (const nxt of FORMS[id].evolvesTo ?? []) {
    out.add(nxt);
    for (const d of descend(nxt)) out.add(d);
  }
  return (DESCENDANTS[id] = out);
};
for (const id of ALL_FORM_IDS) descend(id);

type Held = { formId: string; parts?: Record<string, number> };

/** The shop copies a unit holds: everything merged into it, or one of its own form. */
export const partsOf = (unit: Held): Record<string, number> => unit.parts ?? { [unit.formId]: 1 };

/** The copies of the units a digivolution consumes, all kept in the new form. */
export function mergeParts(units: Held[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const u of units) for (const [id, n] of Object.entries(partsOf(u))) out[id] = (out[id] ?? 0) + n;
  return out;
}

/** Gold refunded when selling a unit: the price of every copy merged into it. */
export function sellValue(unit: Held): number {
  return Object.entries(partsOf(unit)).reduce((a, [id, n]) => a + costOf(id) * n, 0);
}

/** Attribute → display color (Vaccine green, Data blue, Virus purple, Free grey). */
export const ATTR_COLOR: Record<Attribute, string> = {
  Vaccine: "#27e0a3",
  Data: "#3aa0ff",
  Virus: "#b76bff",
  Free: "#b9c2dc",
};

/** Cyber Sleuth's elements: colour and icon (Neutral counts for no synergy). */
export const ELEMENT_COLOR: Record<Element, string> = {
  Fire: "#ff6a3d",
  Water: "#3dc4ff",
  Plant: "#6fdc5a",
  Electric: "#ffd84d",
  Earth: "#d4a46a",
  Wind: "#8ee8d4",
  Light: "#fff1a8",
  Dark: "#a77bff",
  Neutral: "#9aa3b5",
};
export const ELEMENT_ICON: Record<Element, string> = {
  Fire: "🔥",
  Water: "💧",
  Plant: "🌿",
  Electric: "⚡",
  Earth: "⛰️",
  Wind: "🌪️",
  Light: "✨",
  Dark: "🌑",
  Neutral: "◇",
};

/**
 * Rock-paper-scissors triangle (canonical Digimon):
 * Vaccine > Virus > Data > Vaccine. Returns the damage multiplier
 * attacker deals to defender.
 */
export function attributeMultiplier(attacker: Attribute, defender: Attribute): number {
  // Free (the babies) sits outside the triangle
  const beats: Record<Attribute, Attribute | null> = { Vaccine: "Virus", Virus: "Data", Data: "Vaccine", Free: null };
  // tuned by scripts/balance-sim.ts: 1.3/0.77 made mono-attribute fights 100% deterministic
  if (beats[attacker] === defender) return 1.15;
  if (beats[defender] === attacker) return 0.87;
  return 1;
}

interface Stat {
  hp: number;
  attack: number;
  attackSpeed: number;
  range: number;
}

// Stats by [role][stage-1]. Tuned with scripts/balance-sim.ts:
// - stage multiplier ~2.25x so an evolved form respects its 3-copy cost (the babies
//   below Rookie follow the same step)
// - tanks carry HP identity with modest damage
// - see the sim for the full method
const STATS: Record<Role, [Stat, Stat, Stat, Stat, Stat]> = {
  tank: [
    { hp: 26, attack: 2, attackSpeed: 0.6, range: 1 },
    { hp: 58, attack: 4, attackSpeed: 0.6, range: 1 },
    { hp: 130, attack: 10, attackSpeed: 0.6, range: 1 },
    { hp: 292, attack: 22, attackSpeed: 0.6, range: 1 },
    { hp: 645, attack: 48, attackSpeed: 0.6, range: 1 },
  ],
  bruiser: [
    { hp: 19, attack: 3, attackSpeed: 0.7, range: 1 },
    { hp: 42, attack: 6, attackSpeed: 0.7, range: 1 },
    { hp: 95, attack: 13, attackSpeed: 0.7, range: 1 },
    { hp: 214, attack: 29, attackSpeed: 0.7, range: 1 },
    { hp: 470, attack: 64, attackSpeed: 0.72, range: 1 },
  ],
  assassin: [
    { hp: 12, attack: 4, attackSpeed: 0.8, range: 1 },
    { hp: 28, attack: 8, attackSpeed: 0.8, range: 1 },
    { hp: 62, attack: 18, attackSpeed: 0.8, range: 1 },
    { hp: 140, attack: 41, attackSpeed: 0.85, range: 1 },
    { hp: 310, attack: 91, attackSpeed: 0.9, range: 1 },
  ],
  ranged: [
    { hp: 11, attack: 3, attackSpeed: 0.8, range: 3 },
    { hp: 26, attack: 7, attackSpeed: 0.8, range: 3 },
    { hp: 58, attack: 15, attackSpeed: 0.8, range: 3 },
    { hp: 130, attack: 35, attackSpeed: 0.82, range: 3 },
    { hp: 285, attack: 78, attackSpeed: 0.85, range: 3 },
  ],
  caster: [
    { hp: 14, attack: 3, attackSpeed: 0.7, range: 2 },
    { hp: 32, attack: 7, attackSpeed: 0.7, range: 2 },
    { hp: 72, attack: 16, attackSpeed: 0.7, range: 2 },
    { hp: 162, attack: 36, attackSpeed: 0.72, range: 2 },
    { hp: 355, attack: 80, attackSpeed: 0.75, range: 2 },
  ],
};

export function statsFor(form: Form): Stat {
  return STATS[form.role][form.stage - 1];
}
