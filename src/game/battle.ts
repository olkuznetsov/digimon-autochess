import type { Attribute, Fighter } from "./types";
import { FORMS, attributeMultiplier, statsFor } from "./creatures";

export const MOVE_SPEED = 2.2; // cells per second during battle

/** Cosmetic events emitted by stepCombat for the FX layer (damage numbers,
 *  projectiles, death bursts). The balance sim simply doesn't pass a collector. */
export interface CombatEvent {
  kind: "hit" | "death";
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
): Fighter {
  const form = FORMS[formId];
  const s = statsFor(form);
  return {
    uid,
    formId,
    team,
    attribute: form.attribute,
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
  };
}

/**
 * One combat tick: target acquisition, movement, attacks. Mutates fighters in
 * place. Pure game logic — shared by the zustand store (browser) and the
 * headless balance simulator (Node).
 */
export function stepCombat(fighters: Fighter[], dt: number, events?: CombatEvent[]): void {
  const dist = (a: Fighter, b: Fighter) => Math.hypot(a.col - b.col, a.row - b.row);

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
        const dmg = fr.attack * mult;
        target.hp -= dmg;
        fr.cooldown = 1 / fr.attackSpeed;
        events?.push({
          kind: "hit",
          col: target.col,
          row: target.row,
          attr: fr.attribute,
          fromCol: fr.col,
          fromRow: fr.row,
          amount: dmg,
          mult,
          ranged: fr.range > 1.5,
        });
        if (target.hp <= 0) {
          events?.push({ kind: "death", col: target.col, row: target.row, attr: target.attribute });
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
