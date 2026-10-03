import type { Fighter, Procs, Unit } from "./types";
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
  /** the element's own mechanic at its top tier (stacks with the items' procs) */
  procs?: Partial<Procs>;
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
// element plays its own way, and at 4 it gets a mechanic of its own: Fire burns, Water
// keeps mana, Plant has thorns, Electric chains lightning, Earth holds a last stand, Wind
// dodges, Light shields an ally on every cast, Dark wounds healing.
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
    { need: 4, desc: "+22% attack; attacks set the target burning: 10% of attack a second for 3 s", atkPct: 0.22, procs: { burn: 0.1 } },
  ]),
  el("Water", [
    { need: 2, desc: "+20% mana gain", manaPct: 0.2 },
    { need: 4, desc: "+24% mana gain; keeps 25% of its mana after casting", manaPct: 0.24, procs: { castRefund: 0.25 } },
  ]),
  el("Plant", [
    { need: 2, desc: "regenerate 1.5% max HP a second", regenPct: 0.015 },
    { need: 4, desc: "regenerate 2% max HP a second; thorns: attackers take 15% of the damage back", regenPct: 0.02, procs: { reflect: 0.15 } },
  ]),
  el("Electric", [
    { need: 2, desc: "+15% attack speed", asPct: 0.15 },
    {
      need: 4,
      desc: "+20% attack speed; every 4th attack, lightning strikes the target and the enemies around it (60%)",
      asPct: 0.2,
      procs: { chainEvery: 4, chainFactor: 0.6 },
    },
  ]),
  el("Earth", [
    { need: 2, desc: "+15% max HP", hpPct: 0.15 },
    { need: 4, desc: "+16% max HP; the first time below 40% HP: a shield of 16% max HP", hpPct: 0.16, procs: { rescue: 0.16 } },
  ]),
  el("Wind", [
    { need: 2, desc: "ignore 10% of incoming damage", guardPct: 0.1 },
    { need: 4, desc: "ignore 14% of incoming damage; dodges every 4th attack", guardPct: 0.14, procs: { dodgeEvery: 4 } },
  ]),
  el("Light", [
    { need: 2, desc: "a shield of 12% max HP when battle starts", shieldPct: 0.12 },
    {
      need: 4,
      desc: "a shield of 16% max HP when battle starts; every cast shields the most wounded ally for 20% of its max HP",
      shieldPct: 0.16,
      procs: { blessing: 0.2 },
    },
  ]),
  el("Dark", [
    { need: 2, desc: "15% lifesteal", stealPct: 0.15 },
    { need: 4, desc: "18% lifesteal; its hits halve the target's healing for 5 s", stealPct: 0.18, procs: { wounding: 5 } },
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

/** An element's mechanic onto a fighter, stacking sensibly with what its items gave it. */
function addProcs(f: Fighter, add: Partial<Procs>) {
  const p = (f.procs ??= {});
  if (add.burn) p.burn = Math.max(p.burn ?? 0, add.burn);
  if (add.castRefund) p.castRefund = Math.min(0.7, (p.castRefund ?? 0) + add.castRefund);
  if (add.reflect) p.reflect = (p.reflect ?? 0) + add.reflect;
  if (add.chainEvery) {
    p.chainEvery = Math.min(p.chainEvery ?? Infinity, add.chainEvery);
    p.chainFactor = Math.max(p.chainFactor ?? 0, add.chainFactor ?? 1);
  }
  if (add.rescue) p.rescue = Math.min(0.7, (p.rescue ?? 0) + add.rescue);
  if (add.dodgeEvery) p.dodgeEvery = Math.min(p.dodgeEvery ?? Infinity, add.dodgeEvery);
  if (add.blessing) p.blessing = (p.blessing ?? 0) + add.blessing;
  if (add.wounding) p.wounding = Math.max(p.wounding ?? 0, add.wounding);
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
      if (t.procs) addProcs(f, t.procs);
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
