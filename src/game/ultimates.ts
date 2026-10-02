import type { Fighter, Role } from "./types";

/**
 * Per-form ultimate abilities. Every Champion and Mega has its OWN signature move
 * (canonical Digimon special attacks) built from a small set of reusable effect
 * archetypes; rookies fall back to a generic role ability. Cast automatically when
 * mana fills — the renderer plays the unit's `special01` animation on cast.
 *
 * Effects mutate fighters through the context the battle loop provides (`deal`
 * routes shields / lifesteal / FX and attribute damage; `stun` freezes a target),
 * so all damage bookkeeping stays centralized in battle.ts.
 */

export interface UltCtx {
  caster: Fighter;
  target: Fighter;
  allies: Fighter[]; // caster's team, alive
  enemies: Fighter[]; // opposing team, alive
  /** attack-scaled, attribute-adjusted damage from caster → tgt (factor × caster.attack) */
  deal: (tgt: Fighter, factor: number) => void;
  /** apply a stun (seconds), taking the longer of any existing stun */
  stun: (tgt: Fighter, seconds: number) => void;
  dist: (a: Fighter, b: Fighter) => number;
}

/** Which cast visual the FX layer draws for this ability. */
export type UltFx = "blast" | "strike" | "frost" | "barrage" | "guard" | "heal" | "buff";

export interface Ultimate {
  name: string;
  icon: string;
  desc: string;
  fx: UltFx;
  cast: (ctx: UltCtx) => void;
}

/** An effect archetype pairs a cast function with the visual it triggers. */
interface Effect {
  fx: UltFx;
  cast: (c: UltCtx) => void;
}

// ---------- effect archetypes ----------
// Tuned to sit near the old role abilities so balance holds (verify with npm run balance).

/** One devastating blow to the current target. */
const bolt = (factor: number): Effect => ({ fx: "strike", cast: (c) => c.deal(c.target, factor) });

/** A flurry of quick strikes on the current target. */
const barrage = (hits: number, factor: number): Effect => ({
  fx: "barrage",
  cast: (c) => {
    for (let i = 0; i < hits && c.target.hp > 0; i++) c.deal(c.target, factor);
  },
});

/** An explosion centered on the target, hitting everything within radius. */
const nova = (factor: number, radius: number): Effect => ({
  fx: "blast",
  cast: (c) => {
    for (const e of c.enemies) if (c.dist(c.target, e) <= radius) c.deal(e, factor);
  },
});

/** Independent projectiles at the N nearest enemies. */
const volley = (count: number, factor: number): Effect => ({
  fx: "barrage",
  cast: (c) => {
    const ts = [...c.enemies].sort((a, b) => c.dist(c.caster, a) - c.dist(c.caster, b)).slice(0, count);
    for (const t of ts) c.deal(t, factor);
  },
});

/** Raise a shield for a fraction of max HP (optionally shielding the whole team).
 *  Fractions are sized for HP_SCALE: longer fights mean more casts per fight. */
const bulwark = (pct: number, team = false): Effect => ({
  fx: "guard",
  cast: (c) => {
    const targets = team ? c.allies : [c.caster];
    for (const a of targets) a.shield += c.caster.maxHp * pct;
  },
});

/** AoE burst that also freezes everything it hits. */
const freeze = (factor: number, radius: number, seconds: number): Effect => ({
  fx: "frost",
  cast: (c) => {
    for (const e of c.enemies)
      if (c.dist(c.target, e) <= radius) {
        c.deal(e, factor);
        c.stun(e, seconds);
      }
  },
});

/** Extra punishing against a wounded target (below `threshold` HP fraction). */
const execute = (factor: number, threshold: number, bonus: number): Effect => ({
  fx: "strike",
  cast: (c) => c.deal(c.target, c.target.hp / c.target.maxHp <= threshold ? factor * bonus : factor),
});

/** Multi-hit that heals the caster for part of the damage (lifesteal-flavored). */
const siphon = (hits: number, factor: number, heal: number): Effect => ({
  fx: "heal",
  cast: (c) => {
    const before = c.caster.lifesteal;
    c.caster.lifesteal += heal;
    for (let i = 0; i < hits && c.target.hp > 0; i++) c.deal(c.target, factor);
    c.caster.lifesteal = before;
  },
});

/** Big hit on the target plus splash to neighbors. */
const smite = (factor: number, splash: number, radius: number): Effect => ({
  fx: "blast",
  cast: (c) => {
    c.deal(c.target, factor);
    for (const e of c.enemies) if (e.uid !== c.target.uid && c.dist(c.target, e) <= radius) c.deal(e, splash);
  },
});

/** Rally the team: a one-time permanent (for this battle) attack buff to all allies. */
const rally = (atkPct: number): Effect => ({
  fx: "buff",
  cast: (c) => {
    for (const a of c.allies) a.attack = Math.round(a.attack * (1 + atkPct));
  },
});

const u = (name: string, icon: string, desc: string, e: Effect): Ultimate => ({ name, icon, desc, fx: e.fx, cast: e.cast });

// ---------- role fallbacks (rookies) — mirror the previous generic abilities ----------
const ROLE_ULT: Record<Role, Ultimate> = {
  tank: u("Iron Guard", "🛡️", "Shields for 18% of max HP.", bulwark(0.18)),
  bruiser: u("Power Strike", "💥", "A crushing blow for 250% attack.", bolt(2.5)),
  assassin: u("Triple Slash", "🗡️", "Three quick hits (115% each).", barrage(3, 1.15)),
  ranged: u("Multishot", "🏹", "Hits the 3 nearest enemies (130%).", volley(3, 1.3)),
  caster: u("Data Burst", "✨", "AoE around the target (145%).", nova(1.45, 1.6)),
};

// ---------- signature ultimates (Champions + Megas) ----------
export const ULTIMATES: Record<string, Ultimate> = {
  // Dragon's Roar — Agumon line
  greymon: u("Nova Blast", "🔥", "Hurls a fireball for 260% attack.", bolt(2.6)),
  wargreymon: u("Terra Force", "☄️", "Gathers a sun and slams it down — AoE 175%.", nova(1.75, 1.9)),
  blitzgreymon: u("Giga Destroyer", "💥", "Missiles at the 3 nearest foes (150%).", volley(3, 1.5)),
  // Nature Spirits — Gabumon line
  garurumon: u("Howling Blaster", "❄️", "A freezing blast for 250% attack.", bolt(2.5)),
  metalgarurumon: u("Cocytus Breath", "🧊", "Absolute-zero breath: AoE 120% and freezes for 1.2s.", freeze(1.2, 1.7, 1.2)),
  cresgarurumon: u("Crescent Edge", "🌙", "A blinding slash flurry (4×110%).", barrage(4, 1.1)),
  // Nightmare Soldiers — DemiDevimon line
  skullsatamon: u("Nightmare Wave", "💀", "Three cursed strikes (120% each).", barrage(3, 1.2)),
  belzemon: u("Corona Blaster", "🔫", "A point-blank blast at the 2 nearest (200%).", volley(2, 2.0)),
  // Nightmare Soldiers — Hagurumon line
  guardromon: u("Guardian Barrage", "🛡️", "Shields self for 21% max HP.", bulwark(0.21)),
  machinedramon: u("Giga Cannon", "🎯", "One annihilating shot for 420% attack.", bolt(4.2)),
  // Wind Guardians — Patamon line
  angemon: u("Hand of Fate", "🌟", "A holy beam at the 3 nearest (135%).", volley(3, 1.35)),
  magnaangemon: u("Gate of Destiny", "⚔️", "Banishes a weakened foe — 260%, 420% below 30% HP.", execute(2.6, 0.3, 1.6)),
  // Nature Spirits — Dracomon line
  coredramon: u("Blue Flare Breath", "🔥", "A dragon-fire blast for 255%.", bolt(2.55)),
  breakdramon: u("Giga Drill", "🩸", "Braces behind a 9% team shield.", bulwark(0.09, true)),
  // Deep Savers — Keramon line
  infermon: u("Cable Crusher", "🕸️", "Three savage strikes (120% each).", barrage(3, 1.2)),
  diaboromon: u("Web Wrecker", "🕷️", "A viral nova (150%) around the target.", nova(1.5, 1.7)),
  // Nightmare Soldiers — Candlemon line
  meramon: u("Burning Fist", "🔥", "A flaming punch for 250%.", bolt(2.5)),
  gankoomon: u("Tekken Seisai", "👊", "The Hinukamuy fist crushes for 300%.", bolt(3.0)),
  // Nature Spirits — Palmon line
  togemon: u("Needle Spray", "🌵", "Showers needles in an AoE (140%).", nova(1.4, 1.6)),
  rosemon: u("Thorn Whip", "🌹", "Five lashes that heal her (95% each, 25% lifesteal).", siphon(5, 0.95, 0.25)),
  rosemonbm: u("Danger Thorn", "🥀", "A toxic bloom detonates — AoE 185%.", nova(1.85, 1.8)),
  // Deep Savers — Gomamon line
  ikkakumon: u("Harpoon Torpedo", "🐚", "Braces behind a 21% shield.", bulwark(0.21)),
  vikemon: u("Arctic Blizzard", "🧊", "A polar storm: AoE 110% and freezes for 1s.", freeze(1.1, 1.8, 1.0)),
  // Wind Guardians — Veemon line
  exveemon: u("Vee-Laser", "⚡", "An X-shaped beam for 250%.", bolt(2.5)),
  paildramon: u("Desperado Blaster", "🔫", "Rapid fire at the 3 nearest (120%).", volley(3, 1.2)),
  imperialdramon: u("Positron Laser", "🌌", "A galaxy-splitting shot for 400%.", bolt(4.0)),
  // Wind Guardians — Wormmon line
  stingmon: u("Spiking Strike", "🗡️", "Three piercing thrusts (120% each).", barrage(3, 1.2)),
  banchostingmon: u("Bancho Spear", "🥇", "A relentless five-hit combo (105% each).", barrage(5, 1.05)),
  // Dragon's Roar — Guilmon line
  growlmon: u("Pyro Blaster", "🔥", "A blazing blast for 260%.", bolt(2.6)),
  gallantmon: u("Lightning Joust", "⚔️", "A lance strike (280%) that splashes (100%).", smite(2.8, 1.0, 1.6)),
  // Dragon's Roar — Dorumon line
  dorugamon: u("Power Metal", "⚙️", "Fires an iron sphere for 255%.", bolt(2.55)),
  alphamon: u("Seiken Gradalpha", "👑", "The Royal Knight's blade erupts — AoE 185%.", nova(1.85, 2.0)),
  // Support rally on a couple of casters keeps team comps interesting
  candlemon: u("Ember Rally", "🕯️", "Ignites allies: +22% attack for the battle.", rally(0.22)),
  // rookies whose family synergies fit them badly (or too well) get their own moves
  gomamon: u("Marching Fishes", "🐟", "A school of fish rams the target twice (100% each).", barrage(2, 1.0)),
  gabumon: u("Blue Blaster", "🔵", "A blue flame for 290% attack.", bolt(2.9)),
  veemon: u("Vee Headbutt", "💢", "A charging headbutt for 290% attack.", bolt(2.9)),
};

/** Resolve a form's ultimate, falling back to its role ability. */
export function ultimateFor(formId: string, role: Role): Ultimate {
  return ULTIMATES[formId] ?? ROLE_ULT[role];
}
