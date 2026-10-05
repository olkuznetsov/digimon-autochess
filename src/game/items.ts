import type { Element, Fighter } from "./types";

/** Equippable items: base items drop after battle wins; any two base items fuse into one
 *  stronger item (a recipe) — in the item tray, or on a Digimon that already holds the
 *  first one. Click-to-equip in prep (max 2/unit). Some fused items carry a mechanic of
 *  their own (the Crests, Lightning Coil …): battle.ts runs those via Fighter.procs. */
export interface ItemDef {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  /** fused items: the two base items they are made from */
  from?: [string, string];
}

const BASE: Record<string, ItemDef> = {
  powerchip: { id: "powerchip", name: "Power Chip", emoji: "⚔️", desc: "+30% attack" },
  guardplate: { id: "guardplate", name: "Guard Plate", emoji: "🛡️", desc: "+35% max HP" },
  turbodisk: { id: "turbodisk", name: "Turbo Disk", emoji: "⚡", desc: "+25% attack speed" },
  datalens: { id: "datalens", name: "Data Lens", emoji: "🔭", desc: "+1 range" },
  manacore: { id: "manacore", name: "Mana Core", emoji: "🔮", desc: "+60% mana gain" },
  vampirecode: { id: "vampirecode", name: "Vampire Code", emoji: "🩸", desc: "20% lifesteal" },
};

/** Digitama, a Digi-Egg: a rarer component (bosses, the VS carousel). With a base item it
 *  makes a Digimental — Adventure 02's armor eggs, here an emblem of an element — and two
 *  make a Digivice. */
const SPECIAL: Record<string, ItemDef> = {
  digitama: { id: "digitama", name: "Digitama", emoji: "🥚", desc: "a Digi-Egg: with a base item it makes a Digimental, with another Digitama a Digivice" },
};
const fused = (id: string, name: string, emoji: string, desc: string, a: string, b: string): ItemDef => ({
  id,
  name,
  emoji,
  desc,
  from: [a, b],
});

const FUSED: Record<string, ItemDef> = {
  gigablade: fused("gigablade", "Giga Blade", "🗡️", "+70% attack", "powerchip", "powerchip"),
  rapidfang: fused("rapidfang", "Rapid Fang", "🐺", "+30% attack, +30% attack speed", "powerchip", "turbodisk"),
  bloodlust: fused("bloodlust", "Bloodlust Code", "🧛", "+30% attack, 30% lifesteal", "powerchip", "vampirecode"),
  sniperscope: fused("sniperscope", "Sniper Scope", "🎯", "+1 range, +35% attack", "datalens", "powerchip"),
  chromedigizoid: fused("chromedigizoid", "Chrome Digizoid", "🪨", "+50% max HP, takes 15% less damage", "guardplate", "guardplate"),
  holybarrier: fused("holybarrier", "Holy Barrier", "✨", "+25% max HP; casting shields for 20% max HP", "guardplate", "manacore"),
  regenmatrix: fused("regenmatrix", "Regen Matrix", "💚", "+25% max HP, heals 2.5% max HP per second", "guardplate", "vampirecode"),
  accelsdisk: fused("accelsdisk", "Accel Disk", "⏩", "+55% attack speed", "turbodisk", "turbodisk"),
  overclock: fused("overclock", "Overclock Chip", "🔥", "+20% attack speed, +60% mana gain", "manacore", "turbodisk"),
  hawkeye: fused("hawkeye", "Hawk Eye", "🦅", "+1 range, +25% attack speed", "datalens", "turbodisk"),
  digiegg: fused("digiegg", "Digi-Egg of Miracles", "🌟", "starts with 50% mana, +40% mana gain", "manacore", "manacore"),
  crimsoncode: fused("crimsoncode", "Crimson Code", "🩸", "45% lifesteal", "vampirecode", "vampirecode"),
  // ---- every other pair: an item with a mechanic of its own (Adventure's Crests among them)
  couragecrest: fused("couragecrest", "Crest of Courage", "🧡", "+15% attack and HP; every hit dealt or taken: +2% attack, up to +40%", "powerchip", "guardplate"),
  knowledgecrest: fused("knowledgecrest", "Crest of Knowledge", "💜", "+20% attack, +30% mana gain; ultimates deal +35% damage", "powerchip", "manacore"),
  spikeshell: fused("spikeshell", "Spike Shell", "🌵", "+30% max HP; attackers take 25% of the damage back", "guardplate", "turbodisk"),
  reliabilitycrest: fused("reliabilitycrest", "Crest of Reliability", "🩶", "+25% max HP; the first time below 40% HP: a shield of 40% max HP", "guardplate", "datalens"),
  ragechip: fused("ragechip", "Rage Chip", "💢", "+15% attack speed, 10% lifesteal; every attack +6% attack speed, up to +60%", "turbodisk", "vampirecode"),
  lightningcoil: fused("lightningcoil", "Lightning Coil", "🌩️", "+1 range; every 5th attack, lightning strikes the target and every enemy near it (120%)", "datalens", "datalens"),
  bluecard: fused("bluecard", "Blue Card", "🃏", "+30% mana gain; keeps 40% of its mana after casting", "datalens", "manacore"),
  sincerecrest: fused("sincerecrest", "Crest of Sincerity", "🍀", "10% lifesteal; 30% of attack damage heals the most wounded ally", "datalens", "vampirecode"),
  lovecrest: fused("lovecrest", "Crest of Love", "❤️", "+30% mana gain; every cast heals it for 25% max HP", "manacore", "vampirecode"),
  // ---- Digitama + a base item: Digimentals, emblems of an element (TFT's Spatula); two Digitama: a Digivice
  couragemental: fused("couragemental", "Digimental of Courage", "🔶", "counts as Fire; +30% attack", "digitama", "powerchip"),
  friendmental: fused("friendmental", "Digimental of Friendship", "🔷", "counts as Electric; +1 range", "digitama", "datalens"),
  lovemental: fused("lovemental", "Digimental of Love", "💗", "counts as Wind; +25% attack speed", "digitama", "turbodisk"),
  reliamental: fused("reliamental", "Digimental of Reliability", "💧", "counts as Water; +35% max HP", "digitama", "guardplate"),
  kindmental: fused("kindmental", "Digimental of Kindness", "🌑", "counts as Dark; +60% mana gain", "digitama", "manacore"),
  hopemental: fused("hopemental", "Digimental of Hope", "🌠", "its own element counts twice; 20% lifesteal", "digitama", "vampirecode"),
  digivice: fused("digivice", "Digivice", "📟", "+1 Digimon on the board — from the tray, no need to equip it", "digitama", "digitama"),
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

/** Bake item effects into a fighter's combat stats (called from makeFighter). */
export function applyItems(f: Fighter, items: string[]): void {
  const procs = () => (f.procs ??= {});
  const hp = (mult: number) => {
    f.maxHp = Math.round(f.maxHp * mult);
    f.hp = f.maxHp;
  };
  for (const id of items) {
    switch (id) {
      case "powerchip":
        f.attack = Math.round(f.attack * 1.3);
        break;
      case "guardplate":
        hp(1.35);
        break;
      case "turbodisk":
        f.attackSpeed *= 1.25;
        break;
      case "datalens":
        f.range += 1;
        break;
      case "manacore":
        f.manaMult *= 1.6;
        break;
      case "vampirecode":
        f.lifesteal += 0.2;
        break;
      case "gigablade":
        f.attack = Math.round(f.attack * 1.7);
        break;
      case "rapidfang":
        f.attack = Math.round(f.attack * 1.3);
        f.attackSpeed *= 1.3;
        break;
      case "bloodlust":
        f.attack = Math.round(f.attack * 1.3);
        f.lifesteal += 0.3;
        break;
      case "sniperscope":
        f.range += 1;
        f.attack = Math.round(f.attack * 1.35);
        break;
      case "chromedigizoid":
        hp(1.5);
        f.dmgReduction = Math.min(0.5, f.dmgReduction + 0.15);
        break;
      case "holybarrier":
        hp(1.25);
        f.castShield += 0.2;
        break;
      case "regenmatrix":
        hp(1.25);
        f.regen += 0.025;
        break;
      case "accelsdisk":
        f.attackSpeed *= 1.55;
        break;
      case "overclock":
        f.attackSpeed *= 1.2;
        f.manaMult *= 1.6;
        break;
      case "hawkeye":
        f.range += 1;
        f.attackSpeed *= 1.25;
        break;
      case "digiegg":
        f.manaMult *= 1.4;
        f.mana = Math.max(f.mana, f.maxMana * 0.5);
        break;
      case "crimsoncode":
        f.lifesteal += 0.45;
        break;
      // ---- mechanics of their own (battle.ts reads f.procs)
      case "couragecrest":
        f.attack = Math.round(f.attack * 1.15);
        hp(1.15);
        Object.assign(procs(), { courage: 0.02, courageMax: 0.4 });
        break;
      case "knowledgecrest":
        f.attack = Math.round(f.attack * 1.2);
        f.manaMult *= 1.3;
        procs().ultPower = (procs().ultPower ?? 1) * 1.35;
        break;
      case "spikeshell":
        hp(1.3);
        procs().reflect = (procs().reflect ?? 0) + 0.25;
        break;
      case "reliabilitycrest":
        hp(1.25);
        procs().rescue = 0.4;
        break;
      case "ragechip":
        f.attackSpeed *= 1.15;
        f.lifesteal += 0.1;
        Object.assign(procs(), { ramp: 0.06, rampMax: 0.6 });
        break;
      case "lightningcoil":
        f.range += 1;
        Object.assign(procs(), { chainEvery: 5, chainFactor: 1.2 });
        break;
      case "bluecard":
        f.manaMult *= 1.3;
        procs().castRefund = 0.4;
        break;
      case "sincerecrest":
        f.lifesteal += 0.1;
        procs().allyHeal = (procs().allyHeal ?? 0) + 0.3;
        break;
      case "lovecrest":
        f.manaMult *= 1.3;
        procs().castHeal = (procs().castHeal ?? 0) + 0.25;
        break;
      // ---- Digimentals: their component's stat; the element itself counts in synergies.ts
      case "couragemental":
        f.attack = Math.round(f.attack * 1.3);
        break;
      case "friendmental":
        f.range += 1;
        break;
      case "lovemental":
        f.attackSpeed *= 1.25;
        break;
      case "reliamental":
        hp(1.35);
        break;
      case "kindmental":
        f.manaMult *= 1.6;
        break;
      case "hopemental":
        f.lifesteal += 0.2;
        break;
      // ---- relics
      case "holyring":
        f.attackSpeed *= 1.15;
        procs().ccImmune = 10;
        break;
      case "blackgear":
        f.attack = Math.round(f.attack * 1.15);
        procs().wounding = 5;
        break;
    }
  }
}
