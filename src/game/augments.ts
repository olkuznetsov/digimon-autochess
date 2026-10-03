import type { Element, Fighter } from "./types";
import { elementsOf } from "./synergies";

/**
 * Augments (Teamfight Tactics): in a VS match, three times per match every player
 * picks one of three permanent bonuses. Shared by the clients and the match server:
 * combat augments change how fights go, so the room records everyone's picks and
 * sends them with every fight — each client builds every fighter the same way.
 *  - instant: paid out once, when picked (gold, items, units)
 *  - economy: every round from then on (income, interest, XP, rerolls)
 *  - combat: every fight, on every unit of the team (or of one element)
 */

export type AugmentKind = "instant" | "economy" | "combat";

export interface AugmentDef {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  kind: AugmentKind;
  /** combat augments for one element only (a Digimental's counts too) */
  element?: Element;
}

const a = (id: string, name: string, emoji: string, kind: AugmentKind, desc: string, element?: Element): AugmentDef => ({
  id,
  name,
  emoji,
  kind,
  desc,
  element,
});

export const AUGMENTS: Record<string, AugmentDef> = {
  // instant
  treasure: a("treasure", "Treasure Data", "💰", "instant", "+10 gold now"),
  itemcache: a("itemcache", "Item Cache", "🎁", "instant", "2 random items now"),
  fusionlab: a("fusionlab", "Fusion Lab", "⚗️", "instant", "A random fused item now"),
  championegg: a("championegg", "Champion Egg", "🥚", "instant", "A random Champion now"),
  rookierush: a("rookierush", "Rookie Rush", "🐣", "instant", "3 random 1-cost rookies now"),
  // economy
  dividend: a("dividend", "Data Dividend", "📈", "economy", "+2 gold every round"),
  compound: a("compound", "Compound Interest", "🏦", "economy", "Interest can go up to 8 gold (not 5)"),
  fastlearner: a("fastlearner", "Fast Learner", "🎓", "economy", "+2 XP every round"),
  freeroll: a("freeroll", "Lucky Roll", "🎲", "economy", "Your first reroll every round is free"),
  // combat: the whole team
  overclock: a("overclock", "Overclock", "⚔️", "combat", "Your units deal 12% more damage"),
  firewall: a("firewall", "Firewall", "🛡️", "combat", "Your units have 15% more max HP"),
  quickboot: a("quickboot", "Quick Boot", "⚡", "combat", "Your units start fights with 40% mana"),
  leech: a("leech", "Leech Protocol", "🩸", "combat", "Your units heal 12% of the damage they deal"),
  // combat: one element — a bigger dose of its own synergy
  dragonheart: a("dragonheart", "Dragon Heart", "🐉", "combat", "Fire units deal 25% more damage", "Fire"),
  tidalflow: a("tidalflow", "Tidal Flow", "🌊", "combat", "Water units gain 40% more mana", "Water"),
  wildbloom: a("wildbloom", "Wild Bloom", "🌿", "combat", "Plant units heal 2% max HP every second", "Plant"),
  thundersurge: a("thundersurge", "Thunder Surge", "⚡", "combat", "Electric units attack 25% faster", "Electric"),
  bedrock: a("bedrock", "Bedrock", "⛰️", "combat", "Earth units have 30% more max HP", "Earth"),
  stormwings: a("stormwings", "Eye of the Storm", "🌪️", "combat", "Wind units ignore 15% of incoming damage", "Wind"),
  holyaura: a("holyaura", "Holy Aura", "✨", "combat", "Light units start fights with a shield of 25% max HP", "Light"),
  nightmarepact: a("nightmarepact", "Nightmare Pact", "🦇", "combat", "Dark units heal 25% of the damage they deal", "Dark"),
};
export const AUGMENT_IDS = Object.keys(AUGMENTS);

/** Rounds that open with an augment pick — right after every stage's carousel. */
export const AUGMENT_ROUNDS = [4, 9, 14];
export const isAugmentRound = (round: number) => AUGMENT_ROUNDS.includes(round);
export const MAX_AUGMENTS = AUGMENT_ROUNDS.length;

/** Three different augments the player doesn't have (and isn't being offered already). */
export function augmentOffer(owned: string[], exclude: string[] = [], rand: () => number = Math.random): string[] {
  const pool = AUGMENT_IDS.filter((id) => !owned.includes(id) && !exclude.includes(id));
  const offer: string[] = [];
  while (offer.length < 3 && pool.length > 0) offer.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return offer;
}

/** Combat augments on a team's fighters (after synergies; the same on every client). */
export function applyAugments(fighters: Fighter[], augments: string[]): void {
  for (const id of augments) {
    const def = AUGMENTS[id];
    if (!def || def.kind !== "combat") continue;
    for (const f of fighters) {
      if (def.element && !elementsOf(f.formId, f.items).includes(def.element)) continue;
      switch (id) {
        case "overclock":
          f.attack = Math.round(f.attack * 1.12);
          break;
        case "firewall":
          f.maxHp = Math.round(f.maxHp * 1.15);
          f.hp = f.maxHp;
          break;
        case "quickboot":
          f.mana = Math.max(f.mana, f.maxMana * 0.4);
          break;
        case "leech":
          f.lifesteal += 0.12;
          break;
        case "dragonheart":
          f.attack = Math.round(f.attack * 1.25);
          break;
        case "tidalflow":
          f.manaMult *= 1.4;
          break;
        case "wildbloom":
          f.regen += 0.02;
          break;
        case "thundersurge":
          f.attackSpeed *= 1.25;
          break;
        case "bedrock":
          f.maxHp = Math.round(f.maxHp * 1.3);
          f.hp = f.maxHp;
          break;
        case "stormwings":
          f.dmgReduction = Math.min(0.5, f.dmgReduction + 0.15);
          break;
        case "holyaura":
          f.shield += Math.round(f.maxHp * 0.25);
          break;
        case "nightmarepact":
          f.lifesteal += 0.25;
          break;
      }
    }
  }
}
