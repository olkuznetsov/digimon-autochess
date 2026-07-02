import type { Attribute, Family, Form, Role } from "./types";

// The digivolution graph. Rookies (stage 1) are sold in the shop; combine 3 to
// evolve up the branches in `evolvesTo` (>1 option = the player chooses).
// Family stays per line (the "class"); attribute sometimes diverges on a branch
// (the strategic hook). Names are mostly canonical and easy to tweak.

const f = (
  id: string,
  name: string,
  stage: 1 | 2 | 3,
  attribute: Attribute,
  family: Family,
  role: Role,
  extra: { cost?: number; evolvesTo?: string[] } = {},
): Form => ({ id, name, stage, attribute, family, role, ...extra });

export const FORMS: Record<string, Form> = {
  // ============ Agumon — Dragon's Roar ============
  agumon: f("agumon", "Agumon", 1, "Vaccine", "Dragon's Roar", "bruiser", { cost: 1, evolvesTo: ["greymon", "geogreymon", "tyrannomon"] }),
  greymon: f("greymon", "Greymon", 2, "Vaccine", "Dragon's Roar", "bruiser", { evolvesTo: ["metalgreymon"] }),
  geogreymon: f("geogreymon", "GeoGreymon", 2, "Vaccine", "Dragon's Roar", "bruiser", { evolvesTo: ["risegreymon"] }),
  tyrannomon: f("tyrannomon", "Tyrannomon", 2, "Data", "Dragon's Roar", "tank", { evolvesTo: ["metaltyrannomon"] }),
  metalgreymon: f("metalgreymon", "MetalGreymon", 3, "Vaccine", "Dragon's Roar", "bruiser"),
  risegreymon: f("risegreymon", "RizeGreymon", 3, "Vaccine", "Dragon's Roar", "ranged"),
  metaltyrannomon: f("metaltyrannomon", "MetalTyrannomon", 3, "Virus", "Dragon's Roar", "tank"),

  // ============ Gabumon — Nature Spirits ============
  gabumon: f("gabumon", "Gabumon", 1, "Data", "Nature Spirits", "bruiser", { cost: 1, evolvesTo: ["garurumon", "gaogamon"] }),
  garurumon: f("garurumon", "Garurumon", 2, "Data", "Nature Spirits", "bruiser", { evolvesTo: ["weregarurumon", "metalgarurumon"] }),
  gaogamon: f("gaogamon", "Gaogamon", 2, "Data", "Nature Spirits", "bruiser", { evolvesTo: ["machgaogamon"] }),
  weregarurumon: f("weregarurumon", "WereGarurumon", 3, "Data", "Nature Spirits", "assassin"),
  metalgarurumon: f("metalgarurumon", "MetalGarurumon", 3, "Data", "Nature Spirits", "ranged"),
  machgaogamon: f("machgaogamon", "MachGaogamon", 3, "Data", "Nature Spirits", "bruiser"),

  // ============ DemiDevimon — Nightmare Soldiers ============
  demidevimon: f("demidevimon", "DemiDevimon", 1, "Virus", "Nightmare Soldiers", "caster", { cost: 1, evolvesTo: ["devimon", "icedevimon"] }),
  devimon: f("devimon", "Devimon", 2, "Virus", "Nightmare Soldiers", "caster", { evolvesTo: ["myotismon", "skullsatamon"] }),
  icedevimon: f("icedevimon", "IceDevimon", 2, "Virus", "Nightmare Soldiers", "assassin", { evolvesTo: ["skullsatamon"] }),
  myotismon: f("myotismon", "Myotismon", 3, "Virus", "Nightmare Soldiers", "caster"),
  skullsatamon: f("skullsatamon", "SkullSatamon", 3, "Virus", "Nightmare Soldiers", "assassin"),

  // ============ Patamon — Wind Guardians ============
  patamon: f("patamon", "Patamon", 1, "Vaccine", "Wind Guardians", "ranged", { cost: 2, evolvesTo: ["angemon", "pegasusmon"] }),
  angemon: f("angemon", "Angemon", 2, "Vaccine", "Wind Guardians", "ranged", { evolvesTo: ["magnaangemon"] }),
  pegasusmon: f("pegasusmon", "Pegasusmon", 2, "Vaccine", "Wind Guardians", "ranged", { evolvesTo: ["magnaangemon"] }),
  magnaangemon: f("magnaangemon", "MagnaAngemon", 3, "Vaccine", "Wind Guardians", "assassin"),

  // ============ Tentomon — Nature Spirits ============
  tentomon: f("tentomon", "Tentomon", 1, "Data", "Nature Spirits", "tank", { cost: 2, evolvesTo: ["kabuterimon", "kuwagamon"] }),
  kabuterimon: f("kabuterimon", "Kabuterimon", 2, "Data", "Nature Spirits", "tank", { evolvesTo: ["megakabuterimon", "atlurkabuterimon"] }),
  kuwagamon: f("kuwagamon", "Kuwagamon", 2, "Virus", "Nature Spirits", "bruiser", { evolvesTo: ["okuwamon"] }),
  megakabuterimon: f("megakabuterimon", "MegaKabuterimon", 3, "Data", "Nature Spirits", "tank"),
  atlurkabuterimon: f("atlurkabuterimon", "AtlurKabuterimon", 3, "Data", "Nature Spirits", "bruiser"),
  okuwamon: f("okuwamon", "Okuwamon", 3, "Virus", "Nature Spirits", "tank"),

  // ============ Betamon — Deep Savers ============
  betamon: f("betamon", "Betamon", 1, "Virus", "Deep Savers", "tank", { cost: 2, evolvesTo: ["seadramon", "gesomon"] }),
  seadramon: f("seadramon", "Seadramon", 2, "Virus", "Deep Savers", "tank", { evolvesTo: ["megaseadramon", "metalseadramon"] }),
  gesomon: f("gesomon", "Gesomon", 2, "Virus", "Deep Savers", "assassin", { evolvesTo: ["marinedevimon"] }),
  megaseadramon: f("megaseadramon", "MegaSeadramon", 3, "Virus", "Deep Savers", "tank"),
  metalseadramon: f("metalseadramon", "MetalSeadramon", 3, "Virus", "Deep Savers", "ranged"),
  marinedevimon: f("marinedevimon", "MarineDevimon", 3, "Virus", "Deep Savers", "tank"),

  // ============ Bakemon — Nightmare Soldiers ============
  bakemon: f("bakemon", "Bakemon", 1, "Virus", "Nightmare Soldiers", "caster", { cost: 2, evolvesTo: ["soulmon", "devidramon"] }),
  soulmon: f("soulmon", "Soulmon", 2, "Virus", "Nightmare Soldiers", "caster", { evolvesTo: ["phantomon"] }),
  devidramon: f("devidramon", "Devidramon", 2, "Virus", "Nightmare Soldiers", "bruiser", { evolvesTo: ["phantomon"] }),
  phantomon: f("phantomon", "Phantomon", 3, "Virus", "Nightmare Soldiers", "caster"),

  // ============ Biyomon — Wind Guardians ============
  biyomon: f("biyomon", "Biyomon", 1, "Vaccine", "Wind Guardians", "ranged", { cost: 3, evolvesTo: ["birdramon", "saberdramon"] }),
  birdramon: f("birdramon", "Birdramon", 2, "Vaccine", "Wind Guardians", "ranged", { evolvesTo: ["garudamon"] }),
  saberdramon: f("saberdramon", "Saberdramon", 2, "Virus", "Wind Guardians", "ranged", { evolvesTo: ["hippogriffomon"] }),
  garudamon: f("garudamon", "Garudamon", 3, "Vaccine", "Wind Guardians", "ranged"),
  hippogriffomon: f("hippogriffomon", "Hippogriffomon", 3, "Virus", "Wind Guardians", "ranged"),

  // ============ Palmon — Nature Spirits ============
  palmon: f("palmon", "Palmon", 1, "Data", "Nature Spirits", "caster", { cost: 3, evolvesTo: ["togemon", "woodmon"] }),
  togemon: f("togemon", "Togemon", 2, "Data", "Nature Spirits", "caster", { evolvesTo: ["lillymon"] }),
  woodmon: f("woodmon", "Woodmon", 2, "Data", "Nature Spirits", "tank", { evolvesTo: ["cherrymon"] }),
  lillymon: f("lillymon", "Lillymon", 3, "Data", "Nature Spirits", "ranged"),
  cherrymon: f("cherrymon", "Cherrymon", 3, "Data", "Nature Spirits", "tank"),

  // ============ Gomamon — Deep Savers ============
  gomamon: f("gomamon", "Gomamon", 1, "Vaccine", "Deep Savers", "tank", { cost: 3, evolvesTo: ["ikkakumon", "dolphmon"] }),
  ikkakumon: f("ikkakumon", "Ikkakumon", 2, "Vaccine", "Deep Savers", "tank", { evolvesTo: ["zudomon"] }),
  dolphmon: f("dolphmon", "Dolphmon", 2, "Vaccine", "Deep Savers", "ranged", { evolvesTo: ["zudomon"] }),
  zudomon: f("zudomon", "Zudomon", 3, "Vaccine", "Deep Savers", "tank"),

  // ============ Hawkmon — Wind Guardians ============
  hawkmon: f("hawkmon", "Hawkmon", 1, "Vaccine", "Wind Guardians", "caster", { cost: 3, evolvesTo: ["aquilamon", "halsemon"] }),
  aquilamon: f("aquilamon", "Aquilamon", 2, "Vaccine", "Wind Guardians", "ranged", { evolvesTo: ["silphymon"] }),
  halsemon: f("halsemon", "Halsemon", 2, "Vaccine", "Wind Guardians", "assassin", { evolvesTo: ["silphymon"] }),
  silphymon: f("silphymon", "Silphymon", 3, "Vaccine", "Wind Guardians", "assassin"),

  // ============ Guilmon — Dragon's Roar (4-cost) ============
  guilmon: f("guilmon", "Guilmon", 1, "Virus", "Dragon's Roar", "bruiser", { cost: 4, evolvesTo: ["growlmon"] }),
  growlmon: f("growlmon", "Growlmon", 2, "Virus", "Dragon's Roar", "bruiser", { evolvesTo: ["wargrowlmon"] }),
  wargrowlmon: f("wargrowlmon", "WarGrowlmon", 3, "Virus", "Dragon's Roar", "bruiser"),
};

export const ALL_FORM_IDS = Object.keys(FORMS);
export const ROOKIE_IDS = ALL_FORM_IDS.filter((id) => FORMS[id].stage === 1);

/** Attribute → display color (Vaccine green, Data blue, Virus purple). */
export const ATTR_COLOR: Record<Attribute, string> = {
  Vaccine: "#27e0a3",
  Data: "#3aa0ff",
  Virus: "#b76bff",
};

export const FAMILY_COLOR: Record<Family, string> = {
  "Dragon's Roar": "#ff7a3d",
  "Nature Spirits": "#7bd84a",
  "Wind Guardians": "#5fd6ff",
  "Nightmare Soldiers": "#c45cff",
  "Deep Savers": "#3d7bff",
};

/**
 * Rock-paper-scissors triangle (canonical Digimon):
 * Vaccine > Virus > Data > Vaccine. Returns the damage multiplier
 * attacker deals to defender.
 */
export function attributeMultiplier(attacker: Attribute, defender: Attribute): number {
  const beats: Record<Attribute, Attribute> = { Vaccine: "Virus", Virus: "Data", Data: "Vaccine" };
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
// - stage multiplier ~2.25x so a champion respects its 3-rookie cost
//   (3 rookies slightly favored vs 1 champion; 2 rookies clearly lose)
// - tanks carry real threat (they were pure HP sponges at 12% win rate)
// - assassins trimmed (they hard-dominated every melee matchup)
const STATS: Record<Role, [Stat, Stat, Stat]> = {
  tank: [
    { hp: 130, attack: 10, attackSpeed: 0.6, range: 1 },
    { hp: 292, attack: 22, attackSpeed: 0.6, range: 1 },
    { hp: 645, attack: 48, attackSpeed: 0.6, range: 1 },
  ],
  bruiser: [
    { hp: 95, attack: 13, attackSpeed: 0.7, range: 1 },
    { hp: 214, attack: 29, attackSpeed: 0.7, range: 1 },
    { hp: 470, attack: 64, attackSpeed: 0.72, range: 1 },
  ],
  assassin: [
    { hp: 62, attack: 17, attackSpeed: 0.8, range: 1 },
    { hp: 140, attack: 38, attackSpeed: 0.85, range: 1 },
    { hp: 310, attack: 84, attackSpeed: 0.9, range: 1 },
  ],
  ranged: [
    { hp: 58, attack: 15, attackSpeed: 0.8, range: 3 },
    { hp: 130, attack: 35, attackSpeed: 0.82, range: 3 },
    { hp: 285, attack: 78, attackSpeed: 0.85, range: 3 },
  ],
  caster: [
    { hp: 72, attack: 16, attackSpeed: 0.7, range: 2 },
    { hp: 162, attack: 36, attackSpeed: 0.72, range: 2 },
    { hp: 355, attack: 80, attackSpeed: 0.75, range: 2 },
  ],
};

export function statsFor(form: Form): Stat {
  return STATS[form.role][form.stage - 1];
}
