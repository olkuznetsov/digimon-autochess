import type { Fighter, Unit } from "./types";
import { FORMS, ATTR_COLOR, ELEMENT_COLOR, ELEMENT_ICON } from "./creatures";
import { EMBLEM_ELEMENT } from "./items";

export interface TraitTier {
  need: number;
  desc: string;
  hpPct?: number;
  atkPct?: number;
  asPct?: number; // attack-speed %
  rangedOnly?: boolean;
  /** mana gain % */
  manaPct?: number;
  /** regeneration, % of max HP per second */
  regenPct?: number;
  /** share of incoming damage ignored */
  guardPct?: number;
  /** a shield at the start of battle, % of max HP */
  shieldPct?: number;
  /** lifesteal */
  stealPct?: number;
}

export interface TraitDef {
  key: string;
  name: string;
  kind: "attribute" | "element";
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

// Element traits (Cyber Sleuth's elements, the origin axis): two tiers each — 2 different
// members for a taste, 4 for the full bonus (a line's forms count separately). Each
// element plays its own way; the common ones (Fire) give a little less, the rare one
// (Earth) a little more.
const el = (key: "Fire" | "Water" | "Plant" | "Electric" | "Earth" | "Wind" | "Light" | "Dark", tiers: TraitTier[]): TraitDef => ({
  key,
  name: `${ELEMENT_ICON[key]} ${key}`,
  kind: "element",
  color: ELEMENT_COLOR[key],
  tiers,
});
const ELEMENT_TRAITS: TraitDef[] = [
  el("Fire", [
    { need: 2, desc: "+12% attack", atkPct: 0.12 },
    { need: 4, desc: "+30% attack", atkPct: 0.3 },
  ]),
  el("Water", [
    { need: 2, desc: "+30% mana gain", manaPct: 0.3 },
    { need: 4, desc: "+70% mana gain", manaPct: 0.7 },
  ]),
  el("Plant", [
    { need: 2, desc: "regenerate 1.5% max HP a second", regenPct: 0.015 },
    { need: 4, desc: "regenerate 3.5% max HP a second", regenPct: 0.035 },
  ]),
  el("Electric", [
    { need: 2, desc: "+18% attack speed", asPct: 0.18 },
    { need: 4, desc: "+40% attack speed", asPct: 0.4 },
  ]),
  el("Earth", [
    { need: 2, desc: "+22% max HP", hpPct: 0.22 },
    { need: 4, desc: "+48% max HP", hpPct: 0.48 },
  ]),
  el("Wind", [
    { need: 2, desc: "ignore 12% of incoming damage", guardPct: 0.12 },
    { need: 4, desc: "ignore 26% of incoming damage", guardPct: 0.26 },
  ]),
  el("Light", [
    { need: 2, desc: "a shield of 18% max HP when battle starts", shieldPct: 0.18 },
    { need: 4, desc: "a shield of 40% max HP when battle starts", shieldPct: 0.4 },
  ]),
  el("Dark", [
    { need: 2, desc: "15% lifesteal", stealPct: 0.15 },
    { need: 4, desc: "32% lifesteal", stealPct: 0.32 },
  ]),
];

export const TRAITS: TraitDef[] = [...ATTRIBUTE_TRAITS, ...ELEMENT_TRAITS];

/** The elements a unit counts as: its own, plus any its Digimentals add (a Neutral one too). */
export function elementsOf(formId: string, items: string[] = []): string[] {
  const out = [FORMS[formId].element as string];
  for (const it of items) {
    const e = EMBLEM_ELEMENT[it];
    if (e && !out.includes(e)) out.push(e);
  }
  return out;
}

/** Count UNIQUE creature types on the board per trait (duplicates don't double-count).
 *  Digimentals add their element to the holder; Hope makes its own element count twice. */
export function traitCounts(units: Unit[]): Map<string, number> {
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  const add = (trait: string, key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    counts.set(trait, (counts.get(trait) ?? 0) + 1);
  };
  for (const u of units) {
    if (u.placement.kind !== "board") continue;
    const form = FORMS[u.formId];
    add(form.attribute, `${form.attribute}|${u.formId}`);
    for (const e of elementsOf(u.formId, u.items)) add(e, `${e}|${u.formId}`);
    if (u.items?.includes("hopemental")) add(form.element, `hope|${u.formId}`);
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
 *  Fire buffs Fire units) — so committing to a trait matters. */
export function applySynergies(fighters: Fighter[], units: Unit[]): void {
  const counts = traitCounts(units);
  for (const def of TRAITS) {
    const a = activeTier(def, counts.get(def.key) ?? 0);
    if (!a) continue;
    const t = a.tier;
    for (const f of fighters) {
      const cform = FORMS[f.formId];
      const belongs =
        def.kind === "attribute" ? cform.attribute === def.key : elementsOf(f.formId, f.items).includes(def.key);
      if (!belongs) continue;
      if (t.rangedOnly && f.range < 2) continue;
      if (t.hpPct) f.maxHp *= 1 + t.hpPct;
      if (t.atkPct) f.attack *= 1 + t.atkPct;
      if (t.asPct) f.attackSpeed *= 1 + t.asPct;
      if (t.manaPct) f.manaMult *= 1 + t.manaPct;
      if (t.regenPct) f.regen += t.regenPct;
      if (t.guardPct) f.dmgReduction = Math.min(0.5, f.dmgReduction + t.guardPct);
      if (t.stealPct) f.lifesteal += t.stealPct;
    }
  }
  for (const f of fighters) {
    f.maxHp = Math.round(f.maxHp);
    f.attack = Math.round(f.attack);
    f.hp = f.maxHp;
  }
  // Light: a shield when battle starts (sized on the final max HP)
  for (const def of TRAITS) {
    const a = activeTier(def, counts.get(def.key) ?? 0);
    if (!a?.tier.shieldPct) continue;
    for (const f of fighters)
      if (def.kind === "element" && elementsOf(f.formId, f.items).includes(def.key)) f.shield += Math.round(f.maxHp * a.tier.shieldPct);
  }
}
