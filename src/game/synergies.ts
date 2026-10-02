import type { Fighter, Unit } from "./types";
import { FORMS, ATTR_COLOR, FAMILY_COLOR } from "./creatures";

export interface TraitTier {
  need: number;
  desc: string;
  hpPct?: number;
  atkPct?: number;
  asPct?: number; // attack-speed %
  rangedOnly?: boolean;
}

export interface TraitDef {
  key: string;
  name: string;
  kind: "attribute" | "family";
  color: string;
  tiers: TraitTier[]; // ascending by need
}

// Attribute traits (the counter-triangle attributes double as synergies)
const ATTRIBUTE_TRAITS: TraitDef[] = [
  {
    key: "Vaccine", name: "Vaccine", kind: "attribute", color: ATTR_COLOR.Vaccine,
    tiers: [
      { need: 2, desc: "+12% max HP", hpPct: 0.12 },
      { need: 4, desc: "+28% max HP", hpPct: 0.28 },
    ],
  },
  {
    key: "Data", name: "Data", kind: "attribute", color: ATTR_COLOR.Data,
    tiers: [
      { need: 2, desc: "+15% attack speed", asPct: 0.15 },
      { need: 3, desc: "+30% attack speed", asPct: 0.3 },
    ],
  },
  {
    key: "Virus", name: "Virus", kind: "attribute", color: ATTR_COLOR.Virus,
    tiers: [
      { need: 2, desc: "+12% damage", atkPct: 0.12 },
      { need: 4, desc: "+28% damage", atkPct: 0.28 },
    ],
  },
];

// Family traits (origin/class axis): two tiers each — 2 different members for a
// taste, 4 for the full bonus (a line's forms count separately: Agumon + Greymon is 2)
const FAMILY_TRAITS: TraitDef[] = [
  {
    key: "Dragon's Roar", name: "Dragon's Roar", kind: "family", color: FAMILY_COLOR["Dragon's Roar"],
    tiers: [
      { need: 2, desc: "+15% attack", atkPct: 0.15 },
      { need: 4, desc: "+32% attack", atkPct: 0.32 },
    ],
  },
  {
    key: "Nature Spirits", name: "Nature Spirits", kind: "family", color: FAMILY_COLOR["Nature Spirits"],
    tiers: [
      { need: 2, desc: "+12% max HP", hpPct: 0.12 },
      { need: 4, desc: "+30% max HP", hpPct: 0.3 },
    ],
  },
  {
    key: "Wind Guardians", name: "Wind Guardians", kind: "family", color: FAMILY_COLOR["Wind Guardians"],
    tiers: [
      { need: 2, desc: "+15% attack speed", asPct: 0.15 },
      { need: 4, desc: "+35% attack speed", asPct: 0.35 },
    ],
  },
  {
    key: "Nightmare Soldiers", name: "Nightmare Soldiers", kind: "family", color: FAMILY_COLOR["Nightmare Soldiers"],
    tiers: [
      { need: 2, desc: "+14% damage", atkPct: 0.14 },
      { need: 4, desc: "+28% damage", atkPct: 0.28 },
    ],
  },
  {
    key: "Deep Savers", name: "Deep Savers", kind: "family", color: FAMILY_COLOR["Deep Savers"],
    tiers: [
      { need: 2, desc: "+20% max HP", hpPct: 0.2 },
      { need: 4, desc: "+36% max HP", hpPct: 0.36 },
    ],
  },
];

export const TRAITS: TraitDef[] = [...ATTRIBUTE_TRAITS, ...FAMILY_TRAITS];

/** Count UNIQUE creature types on the board per trait (duplicates don't double-count). */
export function traitCounts(units: Unit[]): Map<string, number> {
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  for (const u of units) {
    if (u.placement.kind !== "board" || seen.has(u.formId)) continue;
    seen.add(u.formId);
    const form = FORMS[u.formId];
    counts.set(form.attribute, (counts.get(form.attribute) ?? 0) + 1);
    counts.set(form.family, (counts.get(form.family) ?? 0) + 1);
  }
  return counts;
}

/** Highest tier reached for a given count, or null. Returns its index too. */
export function activeTier(def: TraitDef, count: number): { tier: TraitTier; index: number } | null {
  let res: { tier: TraitTier; index: number } | null = null;
  def.tiers.forEach((tier, index) => {
    if (count >= tier.need) res = { tier, index };
  });
  return res;
}

export interface TraitView {
  def: TraitDef;
  count: number;
  activeIndex: number; // -1 if none active
}

/** Sorted view for the UI: active traits first, then by count desc. */
export function traitViews(units: Unit[]): TraitView[] {
  const counts = traitCounts(units);
  return TRAITS.map((def) => {
    const count = counts.get(def.key) ?? 0;
    const a = activeTier(def, count);
    return { def, count, activeIndex: a ? a.index : -1 };
  })
    .filter((v) => v.count > 0)
    .sort((a, b) => {
      const aa = a.activeIndex >= 0 ? 1 : 0;
      const bb = b.activeIndex >= 0 ? 1 : 0;
      if (aa !== bb) return bb - aa;
      return b.count - a.count;
    });
}

/** Apply active synergy buffs to the player's fighters (mutates them).
 *  A trait only buffs the units that belong to it (Vaccine buffs Vaccine units,
 *  Nature Spirits buffs Nature Spirits units) — so committing to a trait matters. */
export function applySynergies(fighters: Fighter[], units: Unit[]): void {
  const counts = traitCounts(units);
  for (const def of TRAITS) {
    const a = activeTier(def, counts.get(def.key) ?? 0);
    if (!a) continue;
    const t = a.tier;
    for (const f of fighters) {
      const cform = FORMS[f.formId];
      const belongs = def.kind === "attribute" ? cform.attribute === def.key : cform.family === def.key;
      if (!belongs) continue;
      if (t.rangedOnly && f.range < 2) continue;
      if (t.hpPct) f.maxHp *= 1 + t.hpPct;
      if (t.atkPct) f.attack *= 1 + t.atkPct;
      if (t.asPct) f.attackSpeed *= 1 + t.asPct;
    }
  }
  for (const f of fighters) {
    f.maxHp = Math.round(f.maxHp);
    f.attack = Math.round(f.attack);
    f.hp = f.maxHp;
  }
}
