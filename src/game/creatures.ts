import type { Attribute, Family, Form, Role } from "./types";

// The digivolution graph. Rookies (stage 1) are sold in the shop; combine 3 to
// evolve up the branches in `evolvesTo` (>1 option = the player chooses).
// Names are Digimon-flavored placeholders; look comes from glTF models keyed by id.

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
  // ---------- Agumon line (branched showcase) ----------
  agumon: f("agumon", "Agumon", 1, "Vaccine", "Dragon's Roar", "bruiser", { cost: 1, evolvesTo: ["greymon", "geogreymon", "tyrannomon"] }),
  greymon: f("greymon", "Greymon", 2, "Vaccine", "Dragon's Roar", "bruiser", { evolvesTo: ["metalgreymon"] }),
  geogreymon: f("geogreymon", "GeoGreymon", 2, "Vaccine", "Dragon's Roar", "bruiser", { evolvesTo: ["risegreymon"] }),
  tyrannomon: f("tyrannomon", "Tyrannomon", 2, "Data", "Dragon's Roar", "tank", { evolvesTo: ["metaltyrannomon"] }),
  metalgreymon: f("metalgreymon", "MetalGreymon", 3, "Vaccine", "Dragon's Roar", "bruiser"),
  risegreymon: f("risegreymon", "RizeGreymon", 3, "Vaccine", "Dragon's Roar", "ranged"),
  metaltyrannomon: f("metaltyrannomon", "MetalTyrannomon", 3, "Virus", "Dragon's Roar", "tank"),

  // ---------- other lines (single-path for now; branches added per line) ----------
  gabumon: f("gabumon", "Gabumon", 1, "Data", "Nature Spirits", "bruiser", { cost: 1, evolvesTo: ["garurumon"] }),
  garurumon: f("garurumon", "Garurumon", 2, "Data", "Nature Spirits", "bruiser", { evolvesTo: ["weregarurumon"] }),
  weregarurumon: f("weregarurumon", "WereGarurumon", 3, "Data", "Nature Spirits", "assassin"),

  demidevimon: f("demidevimon", "DemiDevimon", 1, "Virus", "Nightmare Soldiers", "caster", { cost: 1, evolvesTo: ["devimon"] }),
  devimon: f("devimon", "Devimon", 2, "Virus", "Nightmare Soldiers", "caster", { evolvesTo: ["myotismon"] }),
  myotismon: f("myotismon", "Myotismon", 3, "Virus", "Nightmare Soldiers", "caster"),

  patamon: f("patamon", "Patamon", 1, "Vaccine", "Wind Guardians", "ranged", { cost: 2, evolvesTo: ["angemon"] }),
  angemon: f("angemon", "Angemon", 2, "Vaccine", "Wind Guardians", "ranged", { evolvesTo: ["magnaangemon"] }),
  magnaangemon: f("magnaangemon", "MagnaAngemon", 3, "Vaccine", "Wind Guardians", "assassin"),

  tentomon: f("tentomon", "Tentomon", 1, "Data", "Nature Spirits", "tank", { cost: 2, evolvesTo: ["kabuterimon"] }),
  kabuterimon: f("kabuterimon", "Kabuterimon", 2, "Data", "Nature Spirits", "tank", { evolvesTo: ["megakabuterimon"] }),
  megakabuterimon: f("megakabuterimon", "MegaKabuterimon", 3, "Data", "Nature Spirits", "tank"),

  betamon: f("betamon", "Betamon", 1, "Virus", "Deep Savers", "tank", { cost: 2, evolvesTo: ["seadramon"] }),
  seadramon: f("seadramon", "Seadramon", 2, "Virus", "Deep Savers", "tank", { evolvesTo: ["megaseadramon"] }),
  megaseadramon: f("megaseadramon", "MegaSeadramon", 3, "Virus", "Deep Savers", "tank"),

  bakemon: f("bakemon", "Bakemon", 1, "Virus", "Nightmare Soldiers", "caster", { cost: 2, evolvesTo: ["soulmon"] }),
  soulmon: f("soulmon", "Soulmon", 2, "Virus", "Nightmare Soldiers", "caster", { evolvesTo: ["phantomon"] }),
  phantomon: f("phantomon", "Phantomon", 3, "Virus", "Nightmare Soldiers", "caster"),

  biyomon: f("biyomon", "Biyomon", 1, "Vaccine", "Wind Guardians", "ranged", { cost: 3, evolvesTo: ["birdramon"] }),
  birdramon: f("birdramon", "Birdramon", 2, "Vaccine", "Wind Guardians", "ranged", { evolvesTo: ["garudamon"] }),
  garudamon: f("garudamon", "Garudamon", 3, "Vaccine", "Wind Guardians", "ranged"),

  palmon: f("palmon", "Palmon", 1, "Data", "Nature Spirits", "caster", { cost: 3, evolvesTo: ["togemon"] }),
  togemon: f("togemon", "Togemon", 2, "Data", "Nature Spirits", "caster", { evolvesTo: ["lillymon"] }),
  lillymon: f("lillymon", "Lillymon", 3, "Data", "Nature Spirits", "ranged"),

  gomamon: f("gomamon", "Gomamon", 1, "Vaccine", "Deep Savers", "tank", { cost: 3, evolvesTo: ["ikkakumon"] }),
  ikkakumon: f("ikkakumon", "Ikkakumon", 2, "Vaccine", "Deep Savers", "tank", { evolvesTo: ["zudomon"] }),
  zudomon: f("zudomon", "Zudomon", 3, "Vaccine", "Deep Savers", "tank"),

  hawkmon: f("hawkmon", "Hawkmon", 1, "Vaccine", "Wind Guardians", "caster", { cost: 3, evolvesTo: ["aquilamon"] }),
  aquilamon: f("aquilamon", "Aquilamon", 2, "Vaccine", "Wind Guardians", "ranged", { evolvesTo: ["silphymon"] }),
  silphymon: f("silphymon", "Silphymon", 3, "Vaccine", "Wind Guardians", "assassin"),

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
  if (beats[attacker] === defender) return 1.3;
  if (beats[defender] === attacker) return 0.77;
  return 1;
}

interface Stat {
  hp: number;
  attack: number;
  attackSpeed: number;
  range: number;
}

// Stats by [role][stage-1]. Higher stages are sharply stronger (3-of-a-kind cost).
const STATS: Record<Role, [Stat, Stat, Stat]> = {
  tank: [
    { hp: 95, attack: 10, attackSpeed: 0.6, range: 1 },
    { hp: 180, attack: 18, attackSpeed: 0.6, range: 1 },
    { hp: 320, attack: 33, attackSpeed: 0.6, range: 1 },
  ],
  bruiser: [
    { hp: 75, attack: 12, attackSpeed: 0.7, range: 1 },
    { hp: 140, attack: 23, attackSpeed: 0.7, range: 1 },
    { hp: 250, attack: 42, attackSpeed: 0.72, range: 1 },
  ],
  assassin: [
    { hp: 58, attack: 16, attackSpeed: 0.8, range: 1 },
    { hp: 105, attack: 31, attackSpeed: 0.85, range: 1 },
    { hp: 190, attack: 56, attackSpeed: 0.9, range: 1 },
  ],
  ranged: [
    { hp: 52, attack: 14, attackSpeed: 0.8, range: 3 },
    { hp: 95, attack: 27, attackSpeed: 0.82, range: 3 },
    { hp: 165, attack: 48, attackSpeed: 0.85, range: 3 },
  ],
  caster: [
    { hp: 62, attack: 13, attackSpeed: 0.7, range: 2 },
    { hp: 115, attack: 25, attackSpeed: 0.72, range: 2 },
    { hp: 205, attack: 45, attackSpeed: 0.75, range: 2 },
  ],
};

export function statsFor(form: Form): Stat {
  return STATS[form.role][form.stage - 1];
}
