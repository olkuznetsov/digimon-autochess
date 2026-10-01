import type { Fighter } from "./types";

/** Equippable items: base items drop after battle wins; two base items fuse into one
 *  stronger item (a recipe) in the item tray. Click-to-equip in prep (max 2/unit). */
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
  digiegg: fused("digiegg", "Digi-Egg of Miracles", "🥚", "starts with 50% mana, +40% mana gain", "manacore", "manacore"),
  crimsoncode: fused("crimsoncode", "Crimson Code", "🩸", "45% lifesteal", "vampirecode", "vampirecode"),
};

export const ITEMS: Record<string, ItemDef> = { ...BASE, ...FUSED };
export const ITEM_IDS = Object.keys(ITEMS);
/** what battles drop */
export const BASE_ITEM_IDS = Object.keys(BASE);

const RECIPES = new Map(Object.values(FUSED).map((d) => [[...d.from!].sort().join("+"), d.id]));

/** The fused item two base items make, if any. */
export function fuseResult(a: string, b: string): string | null {
  return RECIPES.get([a, b].sort().join("+")) ?? null;
}

/** Bake item effects into a fighter's combat stats (called from makeFighter). */
export function applyItems(f: Fighter, items: string[]): void {
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
    }
  }
}
