import type { Attribute, CreatureDef, Family } from "./types";

// Roster. Each creature has an Attribute (Vaccine/Data/Virus — the counter triangle)
// and a Family (the "origin/class" axis). Synergies trigger on counts of each.
// Names are Digimon-flavored placeholders; the look comes later from AI-generated models.

export const CREATURES: Record<string, CreatureDef> = {
  // --- 1 cost ---
  agumon: {
    id: "agumon", name: "Agumon", attribute: "Vaccine", family: "Dragon's Roar", cost: 1,
    line: ["Agumon", "Greymon", "MetalGreymon"],
    base: { hp: 70, attack: 11, attackSpeed: 0.7, range: 1 },
  },
  gabumon: {
    id: "gabumon", name: "Gabumon", attribute: "Data", family: "Nature Spirits", cost: 1,
    line: ["Gabumon", "Garurumon", "WereGarurumon"],
    base: { hp: 65, attack: 10, attackSpeed: 0.75, range: 1 },
  },
  demidevimon: {
    id: "demidevimon", name: "DemiDevimon", attribute: "Virus", family: "Nightmare Soldiers", cost: 1,
    line: ["DemiDevimon", "Devimon", "Myotismon"],
    base: { hp: 50, attack: 9, attackSpeed: 0.8, range: 2 },
  },
  // --- 2 cost ---
  patamon: {
    id: "patamon", name: "Patamon", attribute: "Vaccine", family: "Wind Guardians", cost: 2,
    line: ["Patamon", "Angemon", "MagnaAngemon"],
    base: { hp: 50, attack: 12, attackSpeed: 0.85, range: 3 },
  },
  tentomon: {
    id: "tentomon", name: "Tentomon", attribute: "Data", family: "Nature Spirits", cost: 2,
    line: ["Tentomon", "Kabuterimon", "MegaKabuterimon"],
    base: { hp: 80, attack: 11, attackSpeed: 0.7, range: 1 },
  },
  betamon: {
    id: "betamon", name: "Betamon", attribute: "Virus", family: "Deep Savers", cost: 2,
    line: ["Betamon", "Seadramon", "MegaSeadramon"],
    base: { hp: 75, attack: 12, attackSpeed: 0.65, range: 1 },
  },
  bakemon: {
    id: "bakemon", name: "Bakemon", attribute: "Virus", family: "Nightmare Soldiers", cost: 2,
    line: ["Bakemon", "Soulmon", "Phantomon"],
    base: { hp: 70, attack: 13, attackSpeed: 0.7, range: 1 },
  },
  // --- 3 cost ---
  biyomon: {
    id: "biyomon", name: "Biyomon", attribute: "Vaccine", family: "Wind Guardians", cost: 3,
    line: ["Biyomon", "Birdramon", "Garudamon"],
    base: { hp: 60, attack: 15, attackSpeed: 0.8, range: 3 },
  },
  palmon: {
    id: "palmon", name: "Palmon", attribute: "Data", family: "Nature Spirits", cost: 3,
    line: ["Palmon", "Togemon", "Lillymon"],
    base: { hp: 70, attack: 14, attackSpeed: 0.7, range: 2 },
  },
  gomamon: {
    id: "gomamon", name: "Gomamon", attribute: "Vaccine", family: "Deep Savers", cost: 3,
    line: ["Gomamon", "Ikkakumon", "Zudomon"],
    base: { hp: 95, attack: 12, attackSpeed: 0.6, range: 1 },
  },
  hawkmon: {
    id: "hawkmon", name: "Hawkmon", attribute: "Vaccine", family: "Wind Guardians", cost: 3,
    line: ["Hawkmon", "Aquilamon", "Silphymon"],
    base: { hp: 60, attack: 14, attackSpeed: 0.85, range: 2 },
  },
  // --- 4 cost ---
  guilmon: {
    id: "guilmon", name: "Guilmon", attribute: "Virus", family: "Dragon's Roar", cost: 4,
    line: ["Guilmon", "Growlmon", "WarGrowlmon"],
    base: { hp: 90, attack: 18, attackSpeed: 0.7, range: 1 },
  },
};

export const CREATURE_IDS = Object.keys(CREATURES);

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
  const beats: Record<Attribute, Attribute> = {
    Vaccine: "Virus",
    Virus: "Data",
    Data: "Vaccine",
  };
  if (beats[attacker] === defender) return 1.3;
  if (beats[defender] === attacker) return 0.77;
  return 1;
}

/** Stats scale with star level: each star ~1.8x. */
export function statsFor(def: CreatureDef, star: 1 | 2 | 3) {
  const mult = Math.pow(1.8, star - 1);
  return {
    hp: Math.round(def.base.hp * mult),
    attack: Math.round(def.base.attack * mult),
    attackSpeed: def.base.attackSpeed,
    range: def.base.range,
  };
}

export function displayName(def: CreatureDef, star: 1 | 2 | 3): string {
  return def.line[star - 1];
}
