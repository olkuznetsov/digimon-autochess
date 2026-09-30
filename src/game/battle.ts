import type { Attribute, Fighter } from "./types";
import { FORMS, attributeMultiplier, statsFor } from "./creatures";
import { applyItems } from "./items";
import { ultimateFor, type UltCtx, type UltFx } from "./ultimates";
import { COLS, ROWS } from "./board";

export const MOVE_SPEED = 2.2; // cells per second during battle

/** Fixed simulation step (seconds). The browser, the balance sim and both PvP
 *  clients all advance combat in exactly these increments, so a given battle
 *  always plays out identically. */
export const SIM_DT = 0.05;

/** Moving units steer away from neighbours within this radius (cells), so several
 *  attackers spread around a target instead of stacking on one approach point. */
const SEPARATION_RADIUS = 0.8;
const SEPARATION_WEIGHT = 1.3;

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
  /** cast only: which ultimate visual to draw */
  ult?: UltFx;
  /** cast only: ability name and caster stage (Megas get a cinematic beat) */
  name?: string;
  stage?: number;
  /** cast only: who cast it and where their target stood (AoE visuals land there) */
  form?: string;
  team?: "player" | "enemy";
  toCol?: number;
  toRow?: number;
  /** hit only: a big chunk of the target's max HP (≥14%) */
  heavy?: boolean;
  /** hit only: dealt by an ultimate */
  ability?: boolean;
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
    stunned: 0,
    castKey: 0,
    items,
  };
  applyItems(f, items);
  return f;
}

const dist = (a: Fighter, b: Fighter) => {
  const dx = a.col - b.col;
  const dy = a.row - b.row;
  return Math.sqrt(dx * dx + dy * dy); // not Math.hypot: its rounding differs between JS engines
};

/** Apply damage through shields, feed lifesteal + on-hit mana, emit FX events. */
function dealDamage(src: Fighter, tgt: Fighter, amount: number, events?: CombatEvent[], mult = 1, ability = false) {
  let dmg = amount;
  if (tgt.shield > 0) {
    const absorbed = Math.min(tgt.shield, dmg);
    tgt.shield -= absorbed;
    dmg -= absorbed;
  }
  const wasAlive = tgt.hp > 0;
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
    heavy: amount >= tgt.maxHp * 0.14,
    ability,
  });
  // only on the killing blow: later hits in the same step land on a corpse
  if (wasAlive && tgt.hp <= 0) events?.push({ kind: "death", col: tgt.col, row: tgt.row, attr: tgt.attribute });
}

/** Cast a fighter's signature ultimate (per-form, role fallback). Auto-fires at full mana.
 *  Bumps castKey so the renderer plays the unit's special01 animation. */
function castAbility(fr: Fighter, target: Fighter, fighters: Fighter[], events?: CombatEvent[]) {
  const ult = ultimateFor(fr.formId, fr.role);
  events?.push({
    kind: "cast",
    col: fr.col,
    row: fr.row,
    attr: fr.attribute,
    ult: ult.fx,
    name: ult.name,
    stage: FORMS[fr.formId]?.stage,
    form: fr.formId,
    team: fr.team,
    toCol: target.col,
    toRow: target.row,
  });
  fr.castKey++;
  const ctx: UltCtx = {
    caster: fr,
    target,
    allies: fighters.filter((t) => t.team === fr.team && t.hp > 0),
    enemies: fighters.filter((t) => t.team !== fr.team && t.hp > 0),
    deal: (tgt, factor) => {
      const m = attributeMultiplier(fr.attribute, tgt.attribute);
      dealDamage(fr, tgt, fr.attack * factor * m, events, m * factor, true);
    },
    stun: (tgt, seconds) => {
      tgt.stunned = Math.max(tgt.stunned, seconds);
    },
    dist,
  };
  ult.cast(ctx);
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
    // frozen units can't move, attack, or cast until the stun wears off
    if (fr.stunned > 0) {
      fr.stunned = Math.max(0, fr.stunned - dt);
      fr.moving = false;
      continue;
    }

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
      let dx = (target.col - fr.col) / d;
      let dy = (target.row - fr.row) / d;
      // separation: deterministic (fixed iteration order, sqrt only)
      let sx = 0;
      let sy = 0;
      for (const o of fighters) {
        if (o === fr || o.hp <= 0) continue;
        const ox = fr.col - o.col;
        const oy = fr.row - o.row;
        const dd = Math.sqrt(ox * ox + oy * oy);
        if (dd >= SEPARATION_RADIUS) continue;
        if (dd < 1e-6) {
          sx += fr.uid < o.uid ? 0.5 : -0.5; // exact overlap: split by id
          continue;
        }
        const w = (SEPARATION_RADIUS - dd) / (SEPARATION_RADIUS * dd);
        sx += ox * w;
        sy += oy * w;
      }
      dx += sx * SEPARATION_WEIGHT;
      dy += sy * SEPARATION_WEIGHT;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const step = Math.min(MOVE_SPEED * dt, d);
      fr.col = Math.max(0, Math.min(COLS - 1, fr.col + (dx / len) * step));
      fr.row = Math.max(0, Math.min(ROWS - 1, fr.row + (dy / len) * step));
    }
  }
}
