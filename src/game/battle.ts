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

/** Every unit's HP is multiplied by this. It stretches fights (both sides equally,
 *  so matchups and synergies keep their relative value) to ~12–18 s, long enough
 *  for ultimates to come around and for the animations to read. */
export const HP_SCALE = 1.5;

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
  /** hit only: attacker and target uids (damage meter) */
  src?: string;
  tgt?: string;
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
    hp: Math.round(s.hp * HP_SCALE * hpScale),
    maxHp: Math.round(s.hp * HP_SCALE * hpScale),
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
    dmgReduction: 0,
    castShield: 0,
    regen: 0,
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

/** Out of reach, a unit turns to an enemy this much closer than the one it chases. */
const RETARGET_MARGIN = 0.5;
/** Lightning Coil's reach around the struck target (cells). */
const CHAIN_RADIUS = 1.6;

/** Item mechanics as multipliers at the moment of the hit, so they never fight other
 *  buffs over the stat itself (a rally ultimate raises `attack` mid-fight). */
const atkMult = (f: Fighter) => 1 + (f.procs?.braved ?? 0);
const asMult = (f: Fighter) => 1 + (f.procs?.ramped ?? 0);

/** Every heal goes through here: Black Gear's wound halves it. */
function heal(f: Fighter, amount: number) {
  if (amount <= 0 || f.hp <= 0) return;
  f.hp = Math.min(f.maxHp, f.hp + amount * ((f.wounded ?? 0) > 0 ? 0.5 : 1));
}

/** Crest of Courage: one more stack per hit dealt or taken. */
function brave(f: Fighter) {
  const p = f.procs!;
  p.braved = Math.min(p.courageMax ?? 0, (p.braved ?? 0) + (p.courage ?? 0));
}

/** An item proc's visual: the archetype FX of a cast, with no name or Mega beat (stage 0). */
function procFx(f: Fighter, at: Fighter, ult: UltFx, events?: CombatEvent[]) {
  events?.push({ kind: "cast", col: f.col, row: f.row, attr: f.attribute, ult, stage: 0, team: f.team, toCol: at.col, toRow: at.row });
}

/** Damage through shields with its FX events — nothing else (no lifesteal, mana or item
 *  reactions: thorns use this so they can't bounce back and forth). */
function strike(src: Fighter, tgt: Fighter, amount: number, events: CombatEvent[] | undefined, mult: number, ability: boolean): boolean {
  let dmg = amount;
  if (tgt.shield > 0) {
    const absorbed = Math.min(tgt.shield, dmg);
    tgt.shield -= absorbed;
    dmg -= absorbed;
  }
  const wasAlive = tgt.hp > 0;
  tgt.hp -= dmg;
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
    src: src.uid,
    tgt: tgt.uid,
  });
  // only on the killing blow: later hits in the same step land on a corpse
  if (wasAlive && tgt.hp <= 0) events?.push({ kind: "death", col: tgt.col, row: tgt.row, attr: tgt.attribute });
  return wasAlive;
}

/** Apply damage through shields, feed lifesteal + on-hit mana and the target's item
 *  reactions, emit FX events. Returns the damage dealt (before shields). */
function dealDamage(src: Fighter, tgt: Fighter, raw: number, events?: CombatEvent[], mult = 1, ability = false): number {
  const amount = raw * (1 - tgt.dmgReduction);
  const wasAlive = strike(src, tgt, amount, events, mult, ability);
  if (src.lifesteal > 0) heal(src, amount * src.lifesteal);
  tgt.mana = Math.min(tgt.maxMana, tgt.mana + MANA_PER_HIT_TAKEN * tgt.manaMult);
  if (src.procs?.wounding) tgt.wounded = Math.max(tgt.wounded ?? 0, src.procs.wounding);
  const p = tgt.procs;
  if (p && wasAlive) {
    if (p.courage) brave(tgt);
    if (p.rescue && tgt.hp > 0 && tgt.hp < tgt.maxHp * 0.4) {
      tgt.shield += tgt.maxHp * p.rescue;
      p.rescue = 0;
      procFx(tgt, tgt, "guard", events);
    }
    if (p.reflect && !ability && src.hp > 0) strike(tgt, src, amount * p.reflect, events, 1, false);
  }
  return amount;
}

/** An attack's item procs on the attacker's side, after the hit landed for `dealt`. */
function onAttack(fr: Fighter, target: Fighter, dealt: number, fighters: Fighter[], events?: CombatEvent[]) {
  const p = fr.procs!;
  p.attacks = (p.attacks ?? 0) + 1;
  if (p.courage) brave(fr);
  if (p.ramp) p.ramped = Math.min(p.rampMax ?? 0, (p.ramped ?? 0) + p.ramp);
  if (p.allyHeal) {
    let low: Fighter | null = null;
    for (const a of fighters)
      if (a.team === fr.team && a.hp > 0 && a.hp < a.maxHp && (!low || a.hp / a.maxHp < low.hp / low.maxHp)) low = a;
    if (low) heal(low, dealt * p.allyHeal);
  }
  if (p.chainEvery && p.attacks % p.chainEvery === 0) {
    procFx(fr, target, "blast", events);
    for (const e of fighters) {
      if (e.team === fr.team || e.hp <= 0 || dist(e, target) > CHAIN_RADIUS) continue;
      const m = attributeMultiplier(fr.attribute, e.attribute);
      dealDamage(fr, e, fr.attack * atkMult(fr) * (p.chainFactor ?? 1) * m, events, m, true);
    }
  }
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
  if (fr.castShield > 0) fr.shield += fr.maxHp * fr.castShield;
  if (fr.procs?.castHeal) heal(fr, fr.maxHp * fr.procs.castHeal);
  const ctx: UltCtx = {
    caster: fr,
    target,
    allies: fighters.filter((t) => t.team === fr.team && t.hp > 0),
    enemies: fighters.filter((t) => t.team !== fr.team && t.hp > 0),
    deal: (tgt, factor) => {
      const m = attributeMultiplier(fr.attribute, tgt.attribute);
      dealDamage(fr, tgt, fr.attack * atkMult(fr) * factor * m * (fr.procs?.ultPower ?? 1), events, m * factor, true);
    },
    stun: (tgt, seconds) => {
      if ((tgt.procs?.ccImmune ?? 0) > 0) return; // Holy Ring
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
    if (fr.regen > 0) heal(fr, fr.maxHp * fr.regen * dt);
    if (fr.wounded) fr.wounded = Math.max(0, fr.wounded - dt);
    if (fr.procs?.ccImmune) fr.procs.ccImmune = Math.max(0, fr.procs.ccImmune - dt);
    fr.cooldown = Math.max(0, fr.cooldown - dt);
    // frozen units can't move, attack, or cast until the stun wears off
    if (fr.stunned > 0) {
      fr.stunned = Math.max(0, fr.stunned - dt);
      fr.moving = false;
      continue;
    }

    // the nearest enemy; out of reach a clearly closer one takes over (no chasing one enemy
    // past another), in reach the unit sticks with its target
    let target = fighters.find((t) => t.uid === fr.targetUid && t.hp > 0);
    const chasing = target ? dist(fr, target) : Infinity;
    if (chasing > fr.range + 0.05) {
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
      if (best && (!target || bestD < chasing - RETARGET_MARGIN)) {
        target = best;
        fr.targetUid = best.uid;
      }
    }
    if (!target) continue;

    const d = dist(fr, target);
    if (d <= fr.range + 0.05) {
      fr.moving = false;
      if (fr.cooldown <= 0) {
        const mult = attributeMultiplier(fr.attribute, target.attribute);
        const dealt = dealDamage(fr, target, fr.attack * atkMult(fr) * mult, events, mult);
        if (fr.procs) onAttack(fr, target, dealt, fighters, events);
        fr.cooldown = 1 / (fr.attackSpeed * asMult(fr));
        fr.mana = Math.min(fr.maxMana, fr.mana + MANA_PER_ATTACK * fr.manaMult);
        if (fr.mana >= fr.maxMana && fr.hp > 0) {
          castAbility(fr, target, fighters, events);
          fr.mana = fr.maxMana * (fr.procs?.castRefund ?? 0);
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
