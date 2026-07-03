import type { Fighter } from "./types";

/** Equippable items: dropped after battle wins, click-to-equip in prep (max 2/unit). */
export interface ItemDef {
  id: string;
  name: string;
  emoji: string;
  desc: string;
}

export const ITEMS: Record<string, ItemDef> = {
  powerchip: { id: "powerchip", name: "Power Chip", emoji: "⚔️", desc: "+30% attack" },
  guardplate: { id: "guardplate", name: "Guard Plate", emoji: "🛡️", desc: "+35% max HP" },
  turbodisk: { id: "turbodisk", name: "Turbo Disk", emoji: "⚡", desc: "+25% attack speed" },
  datalens: { id: "datalens", name: "Data Lens", emoji: "🔭", desc: "+1 range" },
  manacore: { id: "manacore", name: "Mana Core", emoji: "🔮", desc: "+60% mana gain" },
  vampirecode: { id: "vampirecode", name: "Vampire Code", emoji: "🩸", desc: "20% lifesteal" },
};

export const ITEM_IDS = Object.keys(ITEMS);

/** Bake item effects into a fighter's combat stats (called from makeFighter). */
export function applyItems(f: Fighter, items: string[]): void {
  for (const id of items) {
    switch (id) {
      case "powerchip":
        f.attack = Math.round(f.attack * 1.3);
        break;
      case "guardplate":
        f.maxHp = Math.round(f.maxHp * 1.35);
        f.hp = f.maxHp;
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
    }
  }
}
