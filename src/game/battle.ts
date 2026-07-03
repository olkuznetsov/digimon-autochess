import type { Attribute, Fighter, Role } from "./types";
import { FORMS, attributeMultiplier, statsFor } from "./creatures";
import { applyItems } from "./items";

export const MOVE_SPEED = 2.2; // cells per second during battle

const MAX_MANA = 100;
const MANA_PER_ATTACK = 15;
const MANA_PER_HIT_TAKEN = 5;

/** Cosmetic events emitted by stepCombat for the FX layer (damage numbers,
 *  projectiles, casts, death bursts). The balance sim simply doesn't pass a collector. */
export interface CombatEvent {
  kind: "hit" | "death" | "cast";
  col: number;
  row: number;
  attr: Attribute;
  /** hit only */
  fromCol?: number;
  fromRow?: number;
  amount?: number;
  mult?: number;
  ranged?: boolean;
}

/** Build a combat-ready Fighter from a form. Used by the store and the balance sim. */
export function makeFighter(
  formId: string,
  uid: string,
  team: "player" | "enemy",
  col: number,
  row: number,
  hpScale = 1,
  items: string[] = [],
): Fighter {
  const form = FORMS[formId];
  const s = statsFor(form);
  const f: Fighter = {
    uid,
    formId,
    team,
    attribute: form.attribute,
    role: form.role,
    hp: Math.round(s.hp * hpScale),
    maxHp: Math.round(s.hp * hpScale),
    attack: s.attack,
    attackSpeed: s.attackSpeed,
    range: s.range,
    col,
    row,
    cooldown: 0,
    moving: false,
    targetUid: null,
    mana: 0,
    maxMana: MAX_MANA,
    shield: 0,
    lifesteal: 0,
    manaMult: 1,
    items,
  };
  applyItems(f, items);
  return f;
}

const dist = (a: Fighter, b: Fighter) => Math.hypot(a.col - b.col, a.row - b.row);

/** Apply damage through shields, feed lifesteal + on-hit mana, emit FX events. */
function dealDamage(src: Fighter, tgt: Fighter, amount: number, events?: CombatEvent[], mult = 1) {
  let dmg = amount;
  if (tgt.shield > 0) {
    const absorbed = Math.min(tgt.shield, dmg);
    tgt.shield -= absorbed;
    dmg -= absorbed;
  }
  tgt.hp -= dmg;
  if (src.lifesteal > 0) src.hp = Math.min(src.maxHp, src.hp + amount * src.lifesteal);
  tgt.mana = Math.min(tgt.maxMana, tgt.mana + MANA_PER_HIT_TAKEN * tgt.manaMult);
  events?.push({
    kind: "hit",
    col: tgt.col,
    row: tgt.row,
    attr: src.attribute,
    fromCol: src.col,
    fromRow: src.row,
    amount,
    mult,
    ranged: src.range > 1.5,
  });
  if (tgt.hp <= 0) events?.push({ kind: "death", col: tgt.col, row: tgt.row, attr: tgt.attribute });
}

/** Role abilities, cast automatically at full mana. Tuned via scripts/balance-sim.ts. */
function castAbility(fr: Fighter, target: Fighter, fighters: Fighter[], events?: CombatEvent[]) {
  events?.push({ kind: "cast", col: fr.col, row: fr.row, attr: fr.attribute });
  const enemies = fighters.filter((t) => t.team !== fr.team && t.hp > 0);
  const role: Role = fr.role;
  switch (role) {
    case "tank": {
      // Iron Guard: shield for 30% of max HP
      fr.shield += fr.maxHp * 0.3;
      break;
    }
    case "bruiser": {
      // Power Strike: one crushing blow
      const m = attributeMultiplier(fr.attribute, target.attribute);
      dealDamage(fr, target, fr.attack * 2.5 * m, events, m * 2.5);
      break;
    }
    case "assassin": {
      // Triple Slash: three quick hits on the current target
      for (let i = 0; i < 3 && target.hp > 0; i++) {
        const m = attributeMultiplier(fr.attribute, target.attribute);
        dealDamage(fr, target, fr.attack * 1.15 * m, events, m * 1.15);
      }
      break;
    }
    case "ranged": {
      // Multishot: hit the 3 nearest enemies
      const targets = enemies.sort((a, b) => dist(fr, a) - dist(fr, b)).slice(0, 3);
      for (const t of targets) {
        const m = attributeMultiplier(fr.attribute, t.attribute);
        dealDamage(fr, t, fr.attack * 1.3 * m, events, m * 1.3);
      }
      break;
    }
    case "caster": {
      // Data Burst: AoE around the current target
      for (const t of enemies) {
        if (dist(target, t) <= 1.6) {
          const m = attributeMultiplier(fr.attribute, t.attribute);
          dealDamage(fr, t, fr.attack * 1.45 * m, events, m * 1.45);
        }
      }
      break;
    }
  }
}

/**
 * One combat tick: target acquisition, movement, attacks, mana + abilities.
 * Mutates fighters in place. Pure game logic — shared by the zustand store
 * (browser) and the headless balance simulator (Node).
 */
export function stepCombat(fighters: Fighter[], dt: number, events?: CombatEvent[]): void {
  for (const fr of fighters) {
    if (fr.hp <= 0) continue;
    fr.cooldown = Math.max(0, fr.cooldown - dt);

    let target = fighters.find((t) => t.uid === fr.targetUid && t.hp > 0);
    if (!target) {
      let best: Fighter | null = null;
      let bestD = Infinity;
      for (const t of fighters) {
        if (t.team === fr.team || t.hp <= 0) continue;
        const d = dist(fr, t);
        if (d < bestD) {
          bestD = d;
          best = t;
        }
      }
      target = best ?? undefined;
      fr.targetUid = best?.uid ?? null;
    }
    if (!target) continue;

    const d = dist(fr, target);
    if (d <= fr.range + 0.05) {
      fr.moving = false;
      if (fr.cooldown <= 0) {
        const mult = attributeMultiplier(fr.attribute, target.attribute);
        dealDamage(fr, target, fr.attack * mult, events, mult);
        fr.cooldown = 1 / fr.attackSpeed;
        fr.mana = Math.min(fr.maxMana, fr.mana + MANA_PER_ATTACK * fr.manaMult);
        if (fr.mana >= fr.maxMana) {
          castAbility(fr, target, fighters, events);
          fr.mana = 0;
        }
      }
    } else {
      fr.moving = true;
      const step = MOVE_SPEED * dt;
      const ux = (target.col - fr.col) / d;
      const uy = (target.row - fr.row) / d;
      fr.col += ux * Math.min(step, d);
      fr.row += uy * Math.min(step, d);
    }
  }
}
