import type { Element, Fighter, Procs } from "./types";

/** Equippable items, Teamfight Tactics' way: base items (components) drop after battle wins;
 *  two components fuse into one item — in the item tray, or on a Digimon that already holds
 *  the first one. Every fused item comes from exactly one pair, keeps the stats of both its
 *  parts (exactly as if the Digimon held the two) and adds an effect no other item has.
 *  Click-to-equip in prep (max 3/unit). The effects run in battle.ts via Fighter.procs. */
export interface ItemDef {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  /** fused items: the two components they are made from */
  from?: [string, string];
}

/** What a component gives — on its own, and inside every item made from it. Multipliers
 *  (attack, max HP, attack speed, mana gain) or flat (range, lifesteal). */
interface Stats {
  atk?: number;
  hp?: number;
  as?: number;
  range?: number;
  mana?: number;
  ls?: number;
}

const PART: Record<string, Stats> = {
  powerchip: { atk: 1.3 },
  guardplate: { hp: 1.35 },
  turbodisk: { as: 1.25 },
  datalens: { range: 1 },
  manacore: { mana: 1.6 },
  vampirecode: { ls: 0.2 },
  // Digitama gives no stats of its own: it makes Digimentals and Digivices
  digitama: {},
};

function applyStats(f: Fighter, s: Stats) {
  if (s.atk) f.attack = Math.round(f.attack * s.atk);
  if (s.hp) {
    f.maxHp = Math.round(f.maxHp * s.hp);
    f.hp = f.maxHp;
  }
  if (s.as) f.attackSpeed *= s.as;
  if (s.range) f.range += s.range;
  if (s.mana) f.manaMult *= s.mana;
  if (s.ls) f.lifesteal += s.ls;
}

/** The stats of some parts together, as the tooltip says them ("+69% attack" for two chips). */
function statText(parts: Stats[]): string {
  const mul = (k: "atk" | "hp" | "as" | "mana") => parts.reduce((m, s) => m * (s[k] ?? 1), 1);
  const sum = (k: "range" | "ls") => parts.reduce((n, s) => n + (s[k] ?? 0), 0);
  const pct = (m: number) => Math.round((m - 1) * 100);
  const out: string[] = [];
  if (mul("atk") !== 1) out.push(`+${pct(mul("atk"))}% attack`);
  if (mul("hp") !== 1) out.push(`+${pct(mul("hp"))}% max HP`);
  if (mul("as") !== 1) out.push(`+${pct(mul("as"))}% attack speed`);
  if (sum("range")) out.push(`+${sum("range")} range`);
  if (mul("mana") !== 1) out.push(`+${pct(mul("mana"))}% mana gain`);
  if (sum("ls")) out.push(`${Math.round(sum("ls") * 100)}% lifesteal`);
  return out.join(", ");
}

const base = (id: string, name: string, emoji: string): ItemDef => ({ id, name, emoji, desc: statText([PART[id]]) });

const BASE: Record<string, ItemDef> = {
  powerchip: base("powerchip", "Power Chip", "⚔️"),
  guardplate: base("guardplate", "Guard Plate", "🛡️"),
  turbodisk: base("turbodisk", "Turbo Disk", "💨"),
  datalens: base("datalens", "Data Lens", "🔭"),
  manacore: base("manacore", "Mana Core", "🔮"),
  vampirecode: base("vampirecode", "Vampire Code", "🩸"),
};

/** Digitama, a Digi-Egg: a rarer component (bosses, the VS carousel). With a base item it
 *  makes a Digimental — Adventure 02's armor eggs, here an emblem of an element — and two
 *  make a Digivice. */
const SPECIAL: Record<string, ItemDef> = {
  digitama: { id: "digitama", name: "Digitama", emoji: "🥚", desc: "a Digi-Egg: with a base item it makes a Digimental, with another Digitama a Digivice" },
};

/** A fused item: its parts' stats, then what it does of its own. */
const fused = (id: string, name: string, emoji: string, a: string, b: string, effect: string): ItemDef => {
  const stats = statText([PART[a], PART[b]]);
  return { id, name, emoji, desc: stats ? `${stats}; ${effect}` : effect, from: [a, b] };
};

// Every pair of components makes one item, and every item does something no other does.
const FUSED: Record<string, ItemDef> = {
  gigablade: fused("gigablade", "Giga Blade", "🗡️", "powerchip", "powerchip", "every 4th attack is a critical hit: double damage"),
  couragecrest: fused("couragecrest", "Crest of Courage", "🧡", "powerchip", "guardplate", "every hit dealt or taken: +2% attack, up to +30%"),
  rapidfang: fused("rapidfang", "Rapid Fang", "🐺", "powerchip", "turbodisk", "+50% damage to enemies below 40% HP"),
  sniperscope: fused("sniperscope", "Sniper Scope", "🎯", "powerchip", "datalens", "+10% attack damage for every cell to the target"),
  knowledgecrest: fused("knowledgecrest", "Crest of Knowledge", "💜", "powerchip", "manacore", "ultimates deal +30% damage"),
  bloodlust: fused("bloodlust", "Bloodlust Code", "🧛", "powerchip", "vampirecode", "each takedown: heals 20% max HP, +10% attack for the battle"),
  chromedigizoid: fused("chromedigizoid", "Chrome Digizoid", "🪨", "guardplate", "guardplate", "takes 15% less damage"),
  spikeshell: fused("spikeshell", "Spike Shell", "🌵", "guardplate", "turbodisk", "attackers take 25% of the damage back"),
  reliabilitycrest: fused("reliabilitycrest", "Crest of Reliability", "🩶", "guardplate", "datalens", "the first time below 40% HP: a shield of 40% max HP"),
  holybarrier: fused("holybarrier", "Holy Barrier", "💠", "guardplate", "manacore", "every cast shields it for 20% max HP"),
  regenmatrix: fused("regenmatrix", "Regen Matrix", "💚", "guardplate", "vampirecode", "regenerates 2.5% max HP a second"),
  accelsdisk: fused("accelsdisk", "Accel Disk", "⏩", "turbodisk", "turbodisk", "allies starting next to it: +15% attack speed"),
  hawkeye: fused("hawkeye", "Hawk Eye", "🦅", "turbodisk", "datalens", "every attack also hits a second enemy in reach (50%)"),
  overclock: fused("overclock", "Overclock Chip", "⏱️", "turbodisk", "manacore", "after every cast: +40% attack speed for 4 s"),
  ragechip: fused("ragechip", "Rage Chip", "💢", "turbodisk", "vampirecode", "every attack: +6% attack speed, up to +60%"),
  lightningcoil: fused("lightningcoil", "Lightning Coil", "🌩️", "datalens", "datalens", "every 5th attack, lightning hits the target and every enemy near it (120%)"),
  bluecard: fused("bluecard", "Blue Card", "🃏", "datalens", "manacore", "keeps 40% of its mana after casting"),
  sincerecrest: fused("sincerecrest", "Crest of Sincerity", "🍀", "datalens", "vampirecode", "30% of its attack damage heals the most wounded ally"),
  digiegg: fused("digiegg", "Digi-Egg of Miracles", "🌟", "manacore", "manacore", "starts every battle with 50% mana"),
  lovecrest: fused("lovecrest", "Crest of Love", "❤️", "manacore", "vampirecode", "every cast heals it for 25% max HP"),
  crimsoncode: fused("crimsoncode", "Crimson Code", "💉", "vampirecode", "vampirecode", "healing past full HP becomes a shield (up to 40% max HP)"),
  // ---- Digitama + a base item: Digimentals, emblems of an element (TFT's Spatula); two Digitama: a Digivice
  couragemental: fused("couragemental", "Digimental of Courage", "🔶", "digitama", "powerchip", "counts as Fire"),
  friendmental: fused("friendmental", "Digimental of Friendship", "🔷", "digitama", "datalens", "counts as Electric"),
  lovemental: fused("lovemental", "Digimental of Love", "💗", "digitama", "turbodisk", "counts as Wind"),
  reliamental: fused("reliamental", "Digimental of Reliability", "💧", "digitama", "guardplate", "counts as Water"),
  kindmental: fused("kindmental", "Digimental of Kindness", "🌑", "digitama", "manacore", "counts as Dark"),
  hopemental: fused("hopemental", "Digimental of Hope", "🌠", "digitama", "vampirecode", "its own element counts twice"),
  digivice: fused("digivice", "Digivice", "📟", "digitama", "digitama", "+1 Digimon on the board — from the tray, no need to equip it"),
};

/** Complete items with no recipe (TFT's artifacts): bosses and the VS carousel hand them
 *  out — counters to freezes and to healing. */
const RELICS: Record<string, ItemDef> = {
  holyring: { id: "holyring", name: "Holy Ring", emoji: "💍", desc: "+15% attack speed; can't be frozen for the first 10 s of a battle" },
  blackgear: { id: "blackgear", name: "Black Gear", emoji: "⚙️", desc: "+15% attack; its hits halve the target's healing for 5 s" },
};

/** Digimental → the element its holder counts as, after Adventure 02's armor forms: Courage
 *  Flamedramon, Friendship Raidramon, Love Halsemon, Reliability Submarimon, Kindness the
 *  Kaiser's (Hope doubles the holder's own instead). */
export const EMBLEM_ELEMENT: Record<string, Element> = {
  couragemental: "Fire",
  friendmental: "Electric",
  lovemental: "Wind",
  reliamental: "Water",
  kindmental: "Dark",
};
/** How many items a Digimon holds. */
export const MAX_ITEMS = 3;

/** Each Digivice owned adds a board slot — in the tray or held by a Digimon (boardCap in store.ts). */
export const DIGIVICE = "digivice";

export const ITEMS: Record<string, ItemDef> = { ...BASE, ...SPECIAL, ...FUSED, ...RELICS };
export const ITEM_IDS = Object.keys(ITEMS);
/** what battles drop */
export const BASE_ITEM_IDS = Object.keys(BASE);
/** what fuses: the base items and Digitama */
export const COMPONENT_IDS = [...BASE_ITEM_IDS, ...Object.keys(SPECIAL)];
/** complete items without a recipe */
export const RELIC_IDS = Object.keys(RELICS);
/** rare loot (bosses, the carousel): Digitama twice as often as each relic */
export const RARE_ITEM_IDS = ["digitama", "digitama", ...RELIC_IDS];
/** two base items fused (bosses and the VS carousel hand these out) */
export const FUSED_ITEM_IDS = Object.keys(FUSED);

const RECIPES = new Map(Object.values(FUSED).map((d) => [[...d.from!].sort().join("+"), d.id]));

/** The fused item two base items make, if any. */
export function fuseResult(a: string, b: string): string | null {
  return RECIPES.get([a, b].sort().join("+")) ?? null;
}

/** What each item does beyond its parts' stats. A second copy on one Digimon adds its stats
 *  again; its effect adds up where it's an amount, and doesn't where it's a rhythm (a crit
 *  every 4th attack stays every 4th). */
const EFFECT: Record<string, (f: Fighter, p: Procs) => void> = {
  gigablade: (_, p) => {
    p.critEvery = Math.min(p.critEvery ?? Infinity, 4);
    p.critMult = 2;
  },
  couragecrest: (_, p) => Object.assign(p, { courage: 0.02, courageMax: 0.3 }),
  rapidfang: (_, p) => {
    p.execute = (p.execute ?? 0) + 0.5;
  },
  sniperscope: (_, p) => {
    p.farShot = (p.farShot ?? 0) + 0.1;
  },
  knowledgecrest: (_, p) => {
    p.ultPower = (p.ultPower ?? 1) * 1.3;
  },
  bloodlust: (_, p) => {
    p.thirst = (p.thirst ?? 0) + 0.1;
    p.feast = (p.feast ?? 0) + 0.2;
  },
  chromedigizoid: (f) => {
    f.dmgReduction = Math.min(0.5, f.dmgReduction + 0.15);
  },
  spikeshell: (_, p) => {
    p.reflect = (p.reflect ?? 0) + 0.25;
  },
  reliabilitycrest: (_, p) => {
    p.rescue = 0.4;
  },
  holybarrier: (f) => {
    f.castShield += 0.2;
  },
  regenmatrix: (f) => {
    f.regen += 0.025;
  },
  accelsdisk: (_, p) => {
    p.aura = (p.aura ?? 0) + 0.15;
  },
  hawkeye: (_, p) => {
    p.multishot = Math.max(p.multishot ?? 0, 0.5);
  },
  overclock: (_, p) => {
    p.overclock = (p.overclock ?? 0) + 0.4;
  },
  ragechip: (_, p) => Object.assign(p, { ramp: 0.06, rampMax: 0.6 }),
  lightningcoil: (_, p) => Object.assign(p, { chainEvery: 5, chainFactor: 1.2 }),
  bluecard: (_, p) => {
    p.castRefund = 0.4;
  },
  sincerecrest: (_, p) => {
    p.allyHeal = (p.allyHeal ?? 0) + 0.3;
  },
  digiegg: (f) => {
    f.mana = Math.max(f.mana, f.maxMana * 0.5);
  },
  lovecrest: (_, p) => {
    p.castHeal = (p.castHeal ?? 0) + 0.25;
  },
  crimsoncode: (_, p) => {
    p.overheal = Math.max(p.overheal ?? 0, 0.4);
  },
  // ---- relics: no parts, so their stats live here
  holyring: (f, p) => {
    f.attackSpeed *= 1.15;
    p.ccImmune = 10;
  },
  blackgear: (f, p) => {
    f.attack = Math.round(f.attack * 1.15);
    p.wounding = 5;
  },
};

/** Bake item effects into a fighter's combat stats (called from makeFighter): each item's
 *  parts (a component is its own part), then its effect. A Digimental's element counts in
 *  synergies.ts; the Accel Disk's aura is laid once the board is set (applyAuras). */
export function applyItems(f: Fighter, items: string[]): void {
  for (const id of items) {
    const def = ITEMS[id];
    if (!def) continue;
    for (const part of def.from ?? [id]) if (PART[part]) applyStats(f, PART[part]);
    const effect = EFFECT[id];
    if (effect) effect(f, (f.procs ??= {}));
  }
}

/** Accel Disk: allies that start the battle next to its holder (the 8 cells around it) attack
 *  faster. Called once a side's fighters stand on their cells (applySynergies). */
export function applyAuras(fighters: Fighter[]): void {
  for (const f of fighters) {
    const aura = f.procs?.aura;
    if (!aura) continue;
    for (const o of fighters)
      if (o !== f && o.team === f.team && Math.abs(o.col - f.col) <= 1 && Math.abs(o.row - f.row) <= 1) o.attackSpeed *= 1 + aura;
  }
}
