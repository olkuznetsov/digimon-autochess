import type { Attribute, Family, Form, Role } from "./types";

// The digivolution graph. Rookies (stage 1) are sold in the shop; combine 3 to
// evolve up the branches in `evolvesTo` (>1 option = the player chooses).
// EVERY form has a real animated model (see src/three/models.ts) — the roster is
// shaped around the models we could source, by design. Branch options diverge in
// attribute/role so the choice is strategic.

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
  // ============ Agumon — Dragon's Roar (branch at Ultimate) ============
  agumon: f("agumon", "Agumon", 1, "Vaccine", "Dragon's Roar", "bruiser", { cost: 1, evolvesTo: ["greymon"] }),
  greymon: f("greymon", "Greymon", 2, "Vaccine", "Dragon's Roar", "bruiser", { evolvesTo: ["wargreymon", "blitzgreymon"] }),
  wargreymon: f("wargreymon", "WarGreymon", 3, "Vaccine", "Dragon's Roar", "bruiser"),
  blitzgreymon: f("blitzgreymon", "BlitzGreymon", 3, "Virus", "Dragon's Roar", "ranged"),

  // ============ Gabumon — Nature Spirits (branch at Ultimate) ============
  gabumon: f("gabumon", "Gabumon", 1, "Data", "Nature Spirits", "bruiser", { cost: 1, evolvesTo: ["garurumon"] }),
  garurumon: f("garurumon", "Garurumon", 2, "Data", "Nature Spirits", "bruiser", { evolvesTo: ["metalgarurumon", "cresgarurumon"] }),
  metalgarurumon: f("metalgarurumon", "MetalGarurumon", 3, "Data", "Nature Spirits", "ranged"),
  cresgarurumon: f("cresgarurumon", "CresGarurumon", 3, "Vaccine", "Nature Spirits", "bruiser"),

  // ============ DemiDevimon — Nightmare Soldiers ============
  demidevimon: f("demidevimon", "DemiDevimon", 1, "Virus", "Nightmare Soldiers", "caster", { cost: 1, evolvesTo: ["skullsatamon"] }),
  skullsatamon: f("skullsatamon", "SkullSatamon", 2, "Virus", "Nightmare Soldiers", "assassin", { evolvesTo: ["belzemon"] }),
  belzemon: f("belzemon", "Beelzemon", 3, "Virus", "Nightmare Soldiers", "ranged"),

  // ============ Hagurumon — Nightmare Soldiers ============
  hagurumon: f("hagurumon", "Hagurumon", 1, "Virus", "Nightmare Soldiers", "tank", { cost: 2, evolvesTo: ["guardromon"] }),
  guardromon: f("guardromon", "Guardromon", 2, "Virus", "Nightmare Soldiers", "tank", { evolvesTo: ["machinedramon"] }),
  machinedramon: f("machinedramon", "Machinedramon", 3, "Virus", "Nightmare Soldiers", "ranged"),

  // ============ Patamon — Wind Guardians ============
  patamon: f("patamon", "Patamon", 1, "Vaccine", "Wind Guardians", "ranged", { cost: 2, evolvesTo: ["angemon"] }),
  angemon: f("angemon", "Angemon", 2, "Vaccine", "Wind Guardians", "ranged", { evolvesTo: ["magnaangemon"] }),
  magnaangemon: f("magnaangemon", "MagnaAngemon", 3, "Vaccine", "Wind Guardians", "assassin"),

  // ============ Dracomon — Nature Spirits ============
  dracomon: f("dracomon", "Dracomon", 1, "Data", "Nature Spirits", "tank", { cost: 2, evolvesTo: ["coredramon"] }),
  coredramon: f("coredramon", "Coredramon", 2, "Data", "Nature Spirits", "bruiser", { evolvesTo: ["breakdramon"] }),
  breakdramon: f("breakdramon", "Breakdramon", 3, "Data", "Nature Spirits", "tank"),

  // ============ Keramon — Deep Savers ============
  keramon: f("keramon", "Keramon", 1, "Virus", "Deep Savers", "caster", { cost: 2, evolvesTo: ["infermon"] }),
  infermon: f("infermon", "Infermon", 2, "Virus", "Deep Savers", "assassin", { evolvesTo: ["diaboromon"] }),
  diaboromon: f("diaboromon", "Diaboromon", 3, "Virus", "Deep Savers", "tank"),

  // ============ Candlemon — Nightmare Soldiers ============
  candlemon: f("candlemon", "Candlemon", 1, "Virus", "Nightmare Soldiers", "caster", { cost: 2, evolvesTo: ["meramon"] }),
  meramon: f("meramon", "Meramon", 2, "Virus", "Nightmare Soldiers", "bruiser", { evolvesTo: ["gankoomon"] }),
  gankoomon: f("gankoomon", "Gankoomon", 3, "Virus", "Nightmare Soldiers", "bruiser"),

  // ============ Palmon — Nature Spirits (branch at Ultimate) ============
  palmon: f("palmon", "Palmon", 1, "Data", "Nature Spirits", "caster", { cost: 3, evolvesTo: ["togemon"] }),
  togemon: f("togemon", "Togemon", 2, "Data", "Nature Spirits", "caster", { evolvesTo: ["rosemon", "rosemonbm"] }),
  rosemon: f("rosemon", "Rosemon", 3, "Data", "Nature Spirits", "ranged"),
  rosemonbm: f("rosemonbm", "Rosemon BM", 3, "Virus", "Nature Spirits", "caster"),

  // ============ Gomamon — Deep Savers ============
  gomamon: f("gomamon", "Gomamon", 1, "Vaccine", "Deep Savers", "tank", { cost: 3, evolvesTo: ["ikkakumon"] }),
  ikkakumon: f("ikkakumon", "Ikkakumon", 2, "Vaccine", "Deep Savers", "tank", { evolvesTo: ["vikemon"] }),
  vikemon: f("vikemon", "Vikemon", 3, "Vaccine", "Deep Savers", "tank"),

  // ============ Veemon — Wind Guardians (branch at Champion) ============
  veemon: f("veemon", "Veemon", 1, "Vaccine", "Wind Guardians", "bruiser", { cost: 3, evolvesTo: ["exveemon", "paildramon"] }),
  exveemon: f("exveemon", "ExVeemon", 2, "Vaccine", "Wind Guardians", "bruiser", { evolvesTo: ["imperialdramon"] }),
  paildramon: f("paildramon", "Paildramon", 2, "Data", "Wind Guardians", "ranged", { evolvesTo: ["imperialdramon"] }),
  imperialdramon: f("imperialdramon", "Imperialdramon", 3, "Vaccine", "Wind Guardians", "ranged"),

  // ============ Wormmon — Wind Guardians ============
  wormmon: f("wormmon", "Wormmon", 1, "Vaccine", "Wind Guardians", "caster", { cost: 3, evolvesTo: ["stingmon"] }),
  stingmon: f("stingmon", "Stingmon", 2, "Vaccine", "Wind Guardians", "assassin", { evolvesTo: ["banchostingmon"] }),
  banchostingmon: f("banchostingmon", "BanchoStingmon", 3, "Vaccine", "Wind Guardians", "assassin"),

  // ============ Guilmon — Dragon's Roar (4-cost) ============
  guilmon: f("guilmon", "Guilmon", 1, "Virus", "Dragon's Roar", "bruiser", { cost: 4, evolvesTo: ["growlmon"] }),
  growlmon: f("growlmon", "Growlmon", 2, "Virus", "Dragon's Roar", "bruiser", { evolvesTo: ["gallantmon"] }),
  gallantmon: f("gallantmon", "Gallantmon", 3, "Virus", "Dragon's Roar", "bruiser"),

  // ============ Dorumon — Dragon's Roar (4-cost) ============
  dorumon: f("dorumon", "Dorumon", 1, "Data", "Dragon's Roar", "bruiser", { cost: 4, evolvesTo: ["dorugamon"] }),
  dorugamon: f("dorugamon", "Dorugamon", 2, "Data", "Dragon's Roar", "bruiser", { evolvesTo: ["alphamon"] }),
  alphamon: f("alphamon", "Alphamon", 3, "Data", "Dragon's Roar", "bruiser"),
};

/** Display names of the three stages (the game's top tier is called Mega throughout). */
export const STAGE_NAME = ["", "Rookie", "Champion", "Mega"] as const;

export const ALL_FORM_IDS = Object.keys(FORMS);
export const ROOKIE_IDS = ALL_FORM_IDS.filter((id) => FORMS[id].stage === 1);

/** Rookie cost of the line each form belongs to (for sell value). */
export const LINE_COST: Record<string, number> = {};
for (const id of ROOKIE_IDS) {
  const cost = FORMS[id].cost ?? 1;
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    LINE_COST[cur] = cost;
    for (const nxt of FORMS[cur].evolvesTo ?? []) stack.push(nxt);
  }
}

/** Gold refunded when selling a form: the rookies invested in it (cost × 3^(stage-1)). */
export function sellValue(formId: string): number {
  const form = FORMS[formId];
  return (LINE_COST[formId] ?? 1) * Math.pow(3, form.stage - 1);
}

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
// - tanks carry HP identity with modest damage
// - see the sim for the full method
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
