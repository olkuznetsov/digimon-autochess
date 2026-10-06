import type { Attribute, Fighter } from "./types";
import { FORMS, STAR3_ULT, STAR_MULT, attributeMultiplier, statsFor } from "./creatures";
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
/** An attack winds up before its blow lands — a share of the attack interval, the moment the
 *  attack animation makes contact (the renderer times the clip to it); attacks per second
 *  are unchanged, only the first blow on arrival waits. */
const WINDUP_SHARE = 0.3;
const WINDUP_MAX = 0.3;
const WINDUP_MIN = 0.1;
/** A ranged attack's shot flies this long before it lands (Electric strikes at once). */
export const SHOT_FLIGHT = 0.2;
const MANA_PER_HIT_TAKEN = 5;

/** Cosmetic events emitted by stepCombat for the FX layer (damage numbers,
 *  projectiles, casts, death bursts). The balance sim simply doesn't pass a collector. */
export interface CombatEvent {
  kind: "hit" | "death" | "cast" | "shot";
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
  /** cast only: a starred Mega's star level (bigger, platinum / prismatic visuals) */
  star?: number;
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
  /** hit only: a burn pulse (Fire), a dodged attack (Wind) or a critical hit (Giga Blade) */
  tag?: "burn" | "miss" | "crit";
  /** shot only: seconds until it lands (the hit follows then) */
  flight?: number;
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
  star = 1,
): Fighter {
  const form = FORMS[formId];
  const s = statsFor(form);
  const sm = STAR_MULT[star] ?? 1;
  const f: Fighter = {
    uid,
    formId,
    team,
    attribute: form.attribute,
    role: form.role,
    hp: Math.round(s.hp * HP_SCALE * hpScale * sm),
    maxHp: Math.round(s.hp * HP_SCALE * hpScale * sm),
    attack: Math.round(s.attack * sm),
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
    ...(star > 1 ? { star } : {}),
  };
  applyItems(f, items);
  if (star >= 3) (f.procs ??= {}).ultPower = (f.procs.ultPower ?? 1) * STAR3_ULT;
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
/** Rapid Fang: enemies below this share of their max HP take its extra damage. */
const EXECUTE_BELOW = 0.4;
/** Overclock Chip: how long its burst of speed lasts after a cast (seconds). */
const OVERCLOCK_TIME = 4;
/** Fire's burn: how long it lasts, and how often it bites (seconds). */
const BURN_TIME = 3;
const BURN_PULSE = 1;

/** Item mechanics as multipliers at the moment of the hit, so they never fight other
 *  buffs over the stat itself (a rally ultimate raises `attack` mid-fight). */
const atkMult = (f: Fighter) => 1 + (f.procs?.braved ?? 0) + (f.procs?.fed ?? 0);
const asMult = (f: Fighter) => 1 + (f.procs?.ramped ?? 0) + ((f.procs?.overclocked ?? 0) > 0 ? f.procs!.overclock! : 0);

/** Every heal goes through here: Black Gear's wound halves it; Crimson Code keeps what
 *  overflows as a shield. */
function heal(f: Fighter, amount: number) {
  if (amount <= 0 || f.hp <= 0) return;
  const got = amount * ((f.wounded ?? 0) > 0 ? 0.5 : 1);
  const over = f.hp + got - f.maxHp;
  f.hp = Math.min(f.maxHp, f.hp + got);
  const cap = f.procs?.overheal;
  if (cap && over > 0) f.shield = Math.max(f.shield, Math.min(f.shield + over, f.maxHp * cap));
}

/** Crest of Courage: one more stack per hit dealt or taken. */
function brave(f: Fighter) {
  const p = f.procs!;
  p.braved = Math.min(p.courageMax ?? 0, (p.braved ?? 0) + (p.courage ?? 0));
}

/** One hit of a tick, applied with all the others once every fighter has acted. */
interface Hit {
  src: Fighter;
  tgt: Fighter;
  /** after the target's damage reduction, before shields */
  amount: number;
  mult: number;
  ability: boolean;
  /** the attacker's lifesteal as it struck (a siphon raises it for its own hits) */
  ls: number;
  /** a burn pulse: no mana, no on-hit effects */
  tag?: "burn";
  /** a critical hit (Giga Blade): only its number looks different */
  crit?: boolean;
}

/**
 * Everything a tick does, gathered while every fighter decides from the same state and
 * applied together afterwards: no side ever acts "first" — the order fighters are listed in
 * decides nothing, and a mirror match is a draw.
 */
interface Tick {
  hits: Hit[];
  shields: Map<Fighter, number>;
  heals: Map<Fighter, number>;
  stuns: Map<Fighter, number>;
  /** attack multipliers (rally ultimates) */
  buffs: Map<Fighter, number>;
  /** Crest of Sincerity: healing for the most wounded ally, picked once the hits are in */
  allyHeals: { src: Fighter; amount: number }[];
  events?: CombatEvent[];
}

const add = (m: Map<Fighter, number>, f: Fighter, v: number) => m.set(f, (m.get(f) ?? 0) + v);

/** Queue a hit; returns its damage (after the target's reduction — and a brooding Mother
 *  Eater's guard). Rapid Fang's holder hits the wounded harder. */
function hit(t: Tick, src: Fighter, tgt: Fighter, raw: number, mult: number, ability: boolean, crit = false): number {
  const execute = src.procs?.execute && tgt.hp < tgt.maxHp * EXECUTE_BELOW ? 1 + src.procs.execute : 1;
  const amount = raw * execute * (1 - tgt.dmgReduction) * (tgt.broodGuard ? BROOD_GUARD : 1);
  t.hits.push({ src, tgt, amount, mult, ability, ls: src.lifesteal, ...(crit ? { crit } : {}) });
  return amount;
}

/** An item proc's visual: the archetype FX of a cast, with no name or Mega beat (stage 0). */
function procFx(f: Fighter, at: Fighter, ult: UltFx, events?: CombatEvent[]) {
  events?.push({ kind: "cast", col: f.col, row: f.row, attr: f.attribute, ult, stage: 0, team: f.team, toCol: at.col, toRow: at.row });
}

/** An attack's item procs on the attacker's side: its own counters now, hits and heals queued. */
function onAttack(fr: Fighter, target: Fighter, dealt: number, fighters: Fighter[], t: Tick) {
  const p = fr.procs!;
  p.attacks = (p.attacks ?? 0) + 1;
  if (p.courage) brave(fr);
  if (p.ramp) p.ramped = Math.min(p.rampMax ?? 0, (p.ramped ?? 0) + p.ramp);
  if (p.allyHeal) t.allyHeals.push({ src: fr, amount: dealt * p.allyHeal });
  if (p.chainEvery && p.attacks % p.chainEvery === 0) {
    procFx(fr, target, "blast", t.events);
    for (const e of fighters) {
      if (e.team === fr.team || e.hp <= 0 || dist(e, target) > CHAIN_RADIUS) continue;
      const m = attributeMultiplier(fr.attribute, e.attribute);
      hit(t, fr, e, fr.attack * atkMult(fr) * (p.chainFactor ?? 1) * m, m, true);
    }
  }
}

/** Hawk Eye's second bolt: the nearest other enemy in reach (equal distances: the same choice
 *  on both sides of a mirror). */
function secondTarget(fr: Fighter, target: Fighter, fighters: Fighter[]): Fighter | null {
  let best: Fighter | null = null;
  let bestD = Infinity;
  for (const x of fighters) {
    if (x === target || x.team === fr.team || x.hp <= 0) continue;
    const d = dist(fr, x);
    if (d > fr.range + 0.05) continue;
    if (d < bestD - 1e-9 || (best && d <= bestD + 1e-9 && preferred(fr, x, best))) {
      bestD = d;
      best = x;
    }
  }
  return best;
}

/** One blow or bolt of an attack: a shot that flies, or (melee, Electric) a hit at once. */
function deliver(fr: Fighter, target: Fighter, raw: number, mult: number, t: Tick, crit: boolean, extra: boolean): number | null {
  if (fr.range > 1.5 && FORMS[fr.formId]?.element !== "Electric") {
    (fr.shots ??= []).push({ tgt: target.uid, left: SHOT_FLIGHT, raw, mult, ...(crit ? { crit } : {}), ...(extra ? { extra } : {}) });
    t.events?.push({ kind: "shot", col: target.col, row: target.row, attr: fr.attribute, fromCol: fr.col, fromRow: fr.row, src: fr.uid, tgt: target.uid, team: fr.team, flight: SHOT_FLIGHT });
    return null;
  }
  return hit(t, fr, target, raw, mult, false, crit);
}

/** A swing's contact: the blow lands (or, ranged, the shot leaves — Electric strikes at once),
 *  the attacker gains mana and casts at full. */
function strike(fr: Fighter, target: Fighter, fighters: Fighter[], t: Tick) {
  const p = fr.procs;
  const mult = attributeMultiplier(fr.attribute, target.attribute);
  let raw = fr.attack * atkMult(fr) * mult;
  // Giga Blade: every critEvery-th attack lands double
  let crit = false;
  if (p?.critEvery) {
    p.swings = (p.swings ?? 0) + 1;
    crit = p.swings % p.critEvery === 0;
    if (crit) raw *= p.critMult ?? 2;
  }
  // Sniper Scope: the farther the target, the harder the attack
  if (p?.farShot) raw *= 1 + p.farShot * dist(fr, target);
  const dealt = deliver(fr, target, raw, mult, t, crit, false);
  if (dealt !== null && p) onAttack(fr, target, dealt, fighters, t);
  // Hawk Eye: a second bolt at another enemy in reach (no attack of its own: no procs)
  const other = p?.multishot ? secondTarget(fr, target, fighters) : null;
  if (other) {
    const m = attributeMultiplier(fr.attribute, other.attribute);
    deliver(fr, other, fr.attack * atkMult(fr) * m * p!.multishot!, m, t, false, true);
  }
  fr.mana = Math.min(fr.maxMana, fr.mana + MANA_PER_ATTACK * fr.manaMult);
  if (fr.mana >= fr.maxMana) {
    castAbility(fr, target, fighters, t);
    fr.mana = fr.maxMana * (fr.procs?.castRefund ?? 0);
  }
}

/** Shots in the air land when their flight runs out — on a target that's still standing. */
function flyShots(fr: Fighter, fighters: Fighter[], dt: number, t: Tick) {
  const shots = fr.shots!;
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    s.left -= dt;
    if (s.left > 1e-9) continue;
    shots.splice(i--, 1);
    const target = fighters.find((x) => x.uid === s.tgt && x.hp > 0);
    if (!target) continue;
    const dealt = hit(t, fr, target, s.raw, s.mult, false, !!s.crit);
    if (fr.procs && !s.extra) onAttack(fr, target, dealt, fighters, t);
  }
}

/** Cast a fighter's signature ultimate (per-form, role fallback). Auto-fires at full mana.
 *  Bumps castKey so the renderer plays the unit's special01 animation. Its effects queue
 *  with the rest of the tick. */
function castAbility(fr: Fighter, target: Fighter, fighters: Fighter[], t: Tick) {
  const ult = ultimateFor(fr.formId, fr.role);
  t.events?.push({
    kind: "cast",
    col: fr.col,
    row: fr.row,
    attr: fr.attribute,
    ult: ult.fx,
    name: ult.name,
    stage: FORMS[fr.formId]?.stage,
    ...(fr.star ? { star: fr.star } : {}),
    form: fr.formId,
    team: fr.team,
    toCol: target.col,
    toRow: target.row,
  });
  fr.castKey++;
  if (fr.procs?.overclock) fr.procs.overclocked = OVERCLOCK_TIME;
  if (fr.castShield > 0) add(t.shields, fr, fr.maxHp * fr.castShield);
  if (fr.procs?.castHeal) add(t.heals, fr, fr.maxHp * fr.procs.castHeal);
  if (fr.procs?.blessing) bless(fr, fr.procs.blessing, fighters, t);
  const ctx: UltCtx = {
    caster: fr,
    target,
    allies: fighters.filter((x) => x.team === fr.team && x.hp > 0),
    enemies: fighters.filter((x) => x.team !== fr.team && x.hp > 0),
    deal: (tgt, factor) => {
      const m = attributeMultiplier(fr.attribute, tgt.attribute);
      hit(t, fr, tgt, fr.attack * atkMult(fr) * factor * m * (fr.procs?.ultPower ?? 1), m * factor, true);
    },
    stun: (tgt, seconds) => {
      t.stuns.set(tgt, Math.max(t.stuns.get(tgt) ?? 0, seconds));
    },
    shield: (f, amount) => add(t.shields, f, amount),
    buff: (f, atkPct) => t.buffs.set(f, (t.buffs.get(f) ?? 1) * (1 + atkPct)),
    dist,
  };
  ult.cast(ctx);
}

/** Light: a shield for the most wounded ally (the caster too) as the tick began; equal
 *  shares go the same way on both sides of a mirror. */
function bless(fr: Fighter, share: number, fighters: Fighter[], t: Tick) {
  let low: Fighter | null = null;
  for (const f of fighters) {
    if (f.team !== fr.team || f.hp <= 0) continue;
    const r = f.hp / f.maxHp;
    const lr = low ? low.hp / low.maxHp : Infinity;
    if (r < lr - 1e-12 || (low && r <= lr + 1e-12 && preferred(fr, f, low))) low = f;
  }
  if (!low) return;
  add(t.shields, low, fr.maxHp * share);
  procFx(low, low, "guard", t.events);
}

/** Damage through shields — a tick's total for a target at once, so hit order can't matter. */
function absorb(f: Fighter, total: number) {
  let dmg = total;
  if (f.shield > 0) {
    const a = Math.min(f.shield, dmg);
    f.shield -= a;
    dmg -= a;
  }
  f.hp -= dmg;
}

const hitEvent = (h: { src: Fighter; tgt: Fighter; amount: number; mult: number; ability: boolean; tag?: "burn" | "miss"; crit?: boolean }): CombatEvent => ({
  kind: "hit",
  col: h.tgt.col,
  row: h.tgt.row,
  attr: h.src.attribute,
  fromCol: h.src.col,
  fromRow: h.src.row,
  amount: h.amount,
  mult: h.mult,
  ranged: h.src.range > 1.5,
  heavy: h.amount >= h.tgt.maxHp * 0.14,
  ability: h.ability,
  src: h.src.uid,
  tgt: h.tgt.uid,
  ...(h.tag ? { tag: h.tag } : h.crit ? { tag: "crit" as const } : {}),
});

/** Apply a tick: shields, buffs and freezes first; then every hit at once (a lethal total
 *  shares the target's remaining HP out among its hits, so overkill heals no one); thorns;
 *  heals; Reliability's rescue; deaths. */
function resolve(fighters: Fighter[], t: Tick) {
  const { events } = t;
  const alive = fighters.filter((f) => f.hp > 0);
  for (const [f, s] of t.shields) f.shield += s;
  for (const [f, m] of t.buffs) f.attack = Math.round(f.attack * m);
  for (const [f, s] of t.stuns) if (!((f.procs?.ccImmune ?? 0) > 0)) f.stunned = Math.max(f.stunned, s); // Holy Ring

  // Wind: a dodger counts the moments it's attacked; every dodgeEvery-th, those attacks miss
  const dodging = new Set<Fighter>();
  for (const h of t.hits) {
    const p = h.tgt.procs;
    if (h.ability || h.tag || !p?.dodgeEvery || dodging.has(h.tgt) || h.tgt.hp <= 0) continue;
    dodging.add(h.tgt);
  }
  for (const f of dodging) {
    const p = f.procs!;
    p.dodgeCount = (p.dodgeCount ?? 0) + 1;
    if (p.dodgeCount % p.dodgeEvery! !== 0) dodging.delete(f);
  }
  if (dodging.size > 0)
    t.hits = t.hits.filter((h) => {
      if (h.ability || h.tag || !dodging.has(h.tgt)) return true;
      events?.push(hitEvent({ ...h, amount: 0, tag: "miss" }));
      return false;
    });

  const taken = new Map<Fighter, number>();
  for (const h of t.hits) add(taken, h.tgt, h.amount);
  const share = new Map<Fighter, number>();
  for (const [f, total] of taken) {
    const room = f.shield + Math.max(0, f.hp);
    share.set(f, total > room && total > 0 ? room / total : 1);
    absorb(f, total);
  }
  for (const h of t.hits) {
    events?.push(hitEvent(h));
    if (h.tag) continue; // a burn pulse: damage only
    h.tgt.mana = Math.min(h.tgt.maxMana, h.tgt.mana + MANA_PER_HIT_TAKEN * h.tgt.manaMult);
    // Fire: an attack sets the target burning (the strongest burn holds; a new one renews it)
    const burn = h.src.procs?.burn;
    if (burn && !h.ability && h.tgt.hp > 0) {
      const dps = h.src.attack * atkMult(h.src) * burn;
      if (!((h.tgt.burnLeft ?? 0) > 0) || dps >= (h.tgt.burnDps ?? 0)) {
        if (!((h.tgt.burnLeft ?? 0) > 0)) h.tgt.burnPulse = 0;
        h.tgt.burnDps = dps;
        h.tgt.burnSrc = h.src.uid;
      }
      h.tgt.burnLeft = BURN_TIME;
    }
    if (h.src.procs?.wounding) h.tgt.wounded = Math.max(h.tgt.wounded ?? 0, h.src.procs.wounding);
    if (h.tgt.procs?.courage) brave(h.tgt);
    if (h.ls > 0) add(t.heals, h.src, h.amount * share.get(h.tgt)! * h.ls);
  }
  // Bloodlust Code: every enemy that falls to this tick's hits feeds each holder that struck it
  // (once a holder, however many of its hits landed)
  const fed = new Set<string>();
  for (const h of t.hits) {
    const p = h.src.procs;
    if (!p?.thirst || h.tgt.hp > 0 || h.src.hp <= 0 || fed.has(`${h.src.uid}>${h.tgt.uid}`)) continue;
    fed.add(`${h.src.uid}>${h.tgt.uid}`);
    p.fed = (p.fed ?? 0) + p.thirst;
    add(t.heals, h.src, h.src.maxHp * (p.feast ?? 0));
  }
  // Spike Shell: attacks struck back after the hits (no lifesteal, no thorns on thorns)
  for (const h of t.hits) {
    const r = h.tgt.procs?.reflect;
    if (!r || h.ability) continue;
    const back = { src: h.tgt, tgt: h.src, amount: h.amount * r, mult: 1, ability: false };
    absorb(back.tgt, back.amount);
    events?.push(hitEvent(back));
  }
  // Crest of Sincerity: each picks the most wounded ally as the hits left them
  const lows = t.allyHeals.map((a) => {
    let low: Fighter | null = null;
    for (const f of fighters)
      if (f.team === a.src.team && f.hp > 0 && f.hp < f.maxHp && (!low || f.hp / f.maxHp < low.hp / low.maxHp)) low = f;
    return low;
  });
  t.allyHeals.forEach((a, i) => lows[i] && add(t.heals, lows[i]!, a.amount));
  for (const [f, v] of t.heals) heal(f, v);

  for (const f of alive) {
    const p = f.procs;
    if (p?.rescue && f.hp > 0 && f.hp < f.maxHp * 0.4) {
      f.shield += f.maxHp * p.rescue;
      p.rescue = 0;
      procFx(f, f, "guard", events);
    }
    if (f.hp <= 0) {
      events?.push({ kind: "death", col: f.col, row: f.row, attr: f.attribute });
      if (f.rebirth) reborn(f, fighters, events);
    }
  }
}

// ---------- the data-eaters' mechanics (Cyber Sleuth's story bosses) ----------

/** the Eater: every DEVOUR_EVERY seconds it bites DEVOUR_SHARE of the max HP off the weakest of
 *  the other side (wherever it stands, past shields and armour), heals as much and grows
 *  DEVOUR_GROWTH stronger — protect the weak, or bring it down fast */
const DEVOUR_EVERY = 5;
const DEVOUR_SHARE = 0.12;
const DEVOUR_GROWTH = 1.04;
/** the Mother Eater: every BROOD_EVERY seconds an Eater Bit hatches next to her (up to
 *  BROOD_MAX alive); while any lives she takes BROOD_GUARD of the damage — clear the brood */
const BROOD_EVERY = 8;
const BROOD_MAX = 2;
const BROOD_GUARD = 0.6;
/** where a Bit hatches around her: the first free cell, in a fixed order */
const BROOD_SPOTS: [number, number][] = [[0, 1], [1, 0], [-1, 0], [1, 1], [-1, 1], [0, -1], [1, -1], [-1, -1]];

function bossMechanic(fr: Fighter, fighters: Fighter[], dt: number, t: Tick) {
  fr.mechT = (fr.mechT ?? 0) - dt;
  if (fr.mechT > 1e-9) return;
  if (fr.mech === "devour") {
    fr.mechT += DEVOUR_EVERY;
    let prey: Fighter | null = null;
    for (const f of fighters) {
      if (f.team === fr.team || f.hp <= 0) continue;
      if (!prey || f.hp < prey.hp - 1e-9 || (f.hp <= prey.hp + 1e-9 && preferred(fr, f, prey))) prey = f;
    }
    if (!prey) return;
    const bite = prey.maxHp * DEVOUR_SHARE;
    t.hits.push({ src: fr, tgt: prey, amount: bite, mult: 1, ability: true, ls: 0 });
    add(t.heals, fr, bite);
    t.buffs.set(fr, (t.buffs.get(fr) ?? 1) * DEVOUR_GROWTH);
    t.events?.push({ kind: "cast", col: fr.col, row: fr.row, attr: fr.attribute, ult: "heal", name: "Devour", stage: 5, form: fr.formId, team: fr.team, toCol: prey.col, toRow: prey.row });
    return;
  }
  // brood
  fr.mechT += BROOD_EVERY;
  if (fighters.filter((f) => f.team === fr.team && f.hp > 0 && f.formId === "eaterbit").length >= BROOD_MAX) return;
  const col0 = Math.round(fr.col);
  const row0 = Math.round(fr.row);
  const spot = BROOD_SPOTS.map(([dc, dr]) => [col0 + dc, row0 + (fr.team === "enemy" ? -dr : dr)] as [number, number]).find(
    ([c, r]) => c >= 0 && c < COLS && r >= 0 && r < ROWS && !fighters.some((f) => f.hp > 0 && Math.abs(f.col - c) < 0.5 && Math.abs(f.row - r) < 0.5),
  );
  if (!spot) return;
  fr.mechN = (fr.mechN ?? 0) + 1;
  const bit = makeFighter("eaterbit", `${fr.uid}~${fr.mechN}`, fr.team, spot[0], spot[1], fr.mechScale ?? 1);
  fighters.push(bit);
  t.events?.push({ kind: "cast", col: fr.col, row: fr.row, attr: fr.attribute, ult: "buff", name: "Brood", stage: 5, form: fr.formId, team: fr.team, toCol: spot[0], toRow: spot[1] });
}

/** A final boss's second phase rises where the first fell (Lucemon Falldown Mode → Satan
 *  Mode): a fresh fighter, the same on every client, with the boss banner. */
function reborn(f: Fighter, fighters: Fighter[], events?: CombatEvent[]) {
  const r = f.rebirth!;
  const next = makeFighter(r.formId, `${f.uid}+`, f.team, f.col, f.row);
  next.maxHp = r.maxHp;
  next.hp = r.maxHp;
  next.attack = r.attack;
  // a boss awakens; a fallen Digimon of the Primary Village mode hatches again as its baby
  const awaken = !!f.boss && !r.hatch;
  next.boss = awaken;
  fighters.push(next);
  events?.push({
    kind: "cast",
    col: f.col,
    row: f.row,
    attr: next.attribute,
    ult: awaken ? "blast" : "heal",
    name: awaken ? "Awakening" : "Reborn",
    stage: awaken ? 5 : 1,
    form: r.formId,
    team: f.team,
    toCol: f.col,
    toRow: f.row,
  });
}

/** Positions live on a 2^-20 grid: a mirrored coordinate (COLS - 1 - x) is then exact, so
 *  both sides of a mirror compute bit-identical distances and reach their targets on the
 *  same tick. */
const snap = (x: number) => Math.round(x * 1048576) / 1048576;

/** Equal distances: the same choice on both sides of a mirror — each team judges from its
 *  own end of the board (the other half is the 180° turn of it). */
function preferred(fr: Fighter, a: Fighter, b: Fighter): boolean {
  const flip = fr.team === "enemy";
  const ac = flip ? COLS - 1 - a.col : a.col;
  const bc = flip ? COLS - 1 - b.col : b.col;
  if (Math.abs(ac - bc) > 1e-9) return ac < bc;
  return (flip ? ROWS - 1 - a.row : a.row) < (flip ? ROWS - 1 - b.row : b.row);
}

/**
 * One combat tick: target acquisition, movement, attacks, mana + abilities. Every fighter
 * decides from the state the tick began with; moves and effects land together at the end
 * (see Tick). Mutates fighters in place. Pure game logic — shared by the zustand store
 * (browser) and the headless balance simulator (Node).
 */
export function stepCombat(fighters: Fighter[], dt: number, events?: CombatEvent[]): void {
  const t: Tick = { hits: [], shields: new Map(), heals: new Map(), stuns: new Map(), buffs: new Map(), allyHeals: [], events };
  const moves: { f: Fighter; col: number; row: number }[] = [];
  // a brooding Mother Eater is guarded while her Bits live (decided as the tick begins)
  for (const f of fighters) if (f.mech === "brood") f.broodGuard = fighters.some((b) => b.team === f.team && b.hp > 0 && b.formId === "eaterbit");
  // the list as the tick began: what hatches during it starts acting the next one
  const acting = fighters.slice();
  for (const fr of acting) {
    if (fr.hp <= 0) continue;
    if (fr.regen > 0) add(t.heals, fr, fr.maxHp * fr.regen * dt);
    if (fr.wounded) fr.wounded = Math.max(0, fr.wounded - dt);
    if ((fr.burnLeft ?? 0) > 0) {
      fr.burnLeft = Math.max(0, fr.burnLeft! - dt);
      fr.burnPulse = (fr.burnPulse ?? 0) + dt;
      if (fr.burnPulse >= BURN_PULSE - 1e-9) {
        fr.burnPulse -= BURN_PULSE;
        const src = fighters.find((x) => x.uid === fr.burnSrc) ?? fr;
        t.hits.push({ src, tgt: fr, amount: fr.burnDps! * BURN_PULSE * (1 - fr.dmgReduction), mult: 1, ability: true, ls: 0, tag: "burn" });
      }
    }
    if (fr.procs?.ccImmune) fr.procs.ccImmune = Math.max(0, fr.procs.ccImmune - dt);
    if (fr.procs?.overclocked) fr.procs.overclocked = Math.max(0, fr.procs.overclocked - dt);
    fr.cooldown = Math.max(0, fr.cooldown - dt);
    if (fr.shots) flyShots(fr, fighters, dt, t);
    // frozen units can't move, attack, or cast until the stun wears off (a swing breaks off)
    if (fr.stunned > 0) {
      fr.stunned = Math.max(0, fr.stunned - dt);
      fr.moving = false;
      fr.swing = undefined;
      continue;
    }
    if (fr.swing !== undefined) {
      fr.swing -= dt;
      if (fr.swing <= 1e-9) {
        fr.swing = undefined;
        const at = fighters.find((x) => x.uid === fr.swingAt && x.hp > 0);
        if (at) strike(fr, at, fighters, t);
      }
    }
    if (fr.mech) bossMechanic(fr, fighters, dt, t);

    // the nearest enemy; out of reach a clearly closer one takes over (no chasing one enemy
    // past another), in reach the unit sticks with its target
    let target = fighters.find((x) => x.uid === fr.targetUid && x.hp > 0);
    const chasing = target ? dist(fr, target) : Infinity;
    if (chasing > fr.range + 0.05) {
      let best: Fighter | null = null;
      let bestD = Infinity;
      for (const x of fighters) {
        if (x.team === fr.team || x.hp <= 0) continue;
        const d = dist(fr, x);
        if (d < bestD - 1e-9 || (best && d <= bestD + 1e-9 && preferred(fr, x, best))) {
          bestD = d;
          best = x;
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
      if (fr.cooldown <= 0 && fr.swing === undefined) {
        // the attack starts: the interval runs from now, the blow lands a wind-up later
        fr.cooldown = 1 / (fr.attackSpeed * asMult(fr));
        fr.swing = Math.min(WINDUP_MAX, Math.max(WINDUP_MIN, fr.cooldown * WINDUP_SHARE));
        fr.swingAt = target.uid;
      }
    } else {
      fr.moving = true;
      let dx = (target.col - fr.col) / d;
      let dy = (target.row - fr.row) / d;
      // separation: deterministic (fixed iteration order, sqrt only); everyone steers from
      // where the others stood when the tick began
      let sx = 0;
      let sy = 0;
      for (const o of fighters) {
        if (o === fr || o.hp <= 0) continue;
        const ox = fr.col - o.col;
        const oy = fr.row - o.row;
        const dd = Math.sqrt(ox * ox + oy * oy);
        if (dd >= SEPARATION_RADIUS) continue;
        if (dd < 1e-6) {
          // exact overlap: split by id, toward each team's own left — the same on both
          // sides of a mirror
          sx += (fr.uid < o.uid ? 0.5 : -0.5) * (fr.team === "player" ? 1 : -1);
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
      moves.push({
        f: fr,
        col: snap(Math.max(0, Math.min(COLS - 1, fr.col + (dx / len) * step))),
        row: snap(Math.max(0, Math.min(ROWS - 1, fr.row + (dy / len) * step))),
      });
    }
  }
  for (const m of moves) {
    m.f.col = m.col;
    m.f.row = m.row;
  }
  resolve(fighters, t);
}
