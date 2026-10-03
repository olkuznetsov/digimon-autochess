import type { Fighter, Role } from "./types";

/**
 * Per-form ultimate abilities. Every Champion and Mega has its OWN signature move
 * (canonical Digimon special attacks) built from a small set of reusable effect
 * archetypes; rookies fall back to a generic role ability. Cast automatically when
 * mana fills — the renderer plays the unit's `special01` animation on cast.
 *
 * Effects act through the context the battle loop provides (`deal`, `stun`, `shield`,
 * `buff`): they queue with the rest of the tick and land together (battle.ts), so all
 * bookkeeping stays centralized there and no side ever acts first.
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
  /** add a shield (absolute HP) */
  shield: (tgt: Fighter, amount: number) => void;
  /** raise attack by a fraction for the rest of the battle */
  buff: (tgt: Fighter, atkPct: number) => void;
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
    for (const a of targets) c.shield(a, c.caster.maxHp * pct);
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
    for (const a of c.allies) c.buff(a, atkPct);
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
  // Agumon line
  greymon: u("Nova Blast", "🔥", "Hurls a fireball for 260% attack.", bolt(2.6)),
  wargreymon: u("Terra Force", "☄️", "Gathers a sun and slams it down — AoE 175%.", nova(1.75, 1.9)),
  blitzgreymon: u("Giga Destroyer", "💥", "Missiles at the 3 nearest foes (145%).", volley(3, 1.45)),
  // Gabumon line
  garurumon: u("Howling Blaster", "❄️", "A freezing blast for 240% attack.", bolt(2.4)),
  metalgarurumon: u("Cocytus Breath", "🧊", "Absolute-zero breath: AoE 120% and freezes for 1.2s.", freeze(1.2, 1.7, 1.2)),
  cresgarurumon: u("Crescent Edge", "🌙", "A blinding slash flurry (4×110%).", barrage(4, 1.1)),
  // DemiDevimon line
  skullsatamon: u("Nightmare Wave", "💀", "Three cursed strikes (120% each).", barrage(3, 1.2)),
  belzemon: u("Corona Blaster", "🔫", "A point-blank blast at the 2 nearest (200%).", volley(2, 2.0)),
  // Hagurumon line
  guardromon: u("Guardian Barrage", "🛡️", "Shields self for 21% max HP.", bulwark(0.21)),
  machinedramon: u("Giga Cannon", "🎯", "One annihilating shot for 420% attack.", bolt(4.2)),
  // Patamon line
  angemon: u("Hand of Fate", "🌟", "A holy beam at the 3 nearest (135%).", volley(3, 1.35)),
  magnaangemon: u("Gate of Destiny", "⚔️", "Banishes a weakened foe — 260%, 420% below 30% HP.", execute(2.6, 0.3, 1.6)),
  // Dracomon line
  coredramon: u("Blue Flare Breath", "🔥", "A dragon-fire blast for 240%.", bolt(2.4)),
  breakdramon: u("Giga Drill", "🩸", "Braces behind a 5% team shield.", bulwark(0.05, true)),
  // Keramon line
  infermon: u("Cable Crusher", "🕸️", "Three savage strikes that feed it (135% each, 35% lifesteal).", siphon(3, 1.35, 0.35)),
  diaboromon: u("Web Wrecker", "🕷️", "A viral nova (150%) around the target.", nova(1.5, 1.7)),
  // Candlemon line
  meramon: u("Burning Fist", "🔥", "A flaming punch for 250%.", bolt(2.5)),
  gankoomon: u("Tekken Seisai", "👊", "The Hinukamuy fist crushes for 300%.", bolt(3.0)),
  // Palmon line
  togemon: u("Needle Spray", "🌵", "Showers needles in an AoE (140%).", nova(1.4, 1.6)),
  rosemon: u("Thorn Whip", "🌹", "Five lashes that heal her (75% each, 20% lifesteal).", siphon(5, 0.75, 0.2)),
  rosemonbm: u("Danger Thorn", "🥀", "A toxic bloom detonates — AoE 185%.", nova(1.85, 1.8)),
  // Gomamon line
  ikkakumon: u("Harpoon Torpedo", "🐚", "Braces behind a 17% shield.", bulwark(0.17)),
  vikemon: u("Arctic Blizzard", "🧊", "A polar storm: AoE 110% and freezes for 1s.", freeze(1.1, 1.8, 1.0)),
  // Veemon line
  exveemon: u("Vee-Laser", "⚡", "An X-shaped beam for 250%.", bolt(2.5)),
  paildramon: u("Desperado Blaster", "🔫", "Rapid fire at the 2 nearest (105%).", volley(2, 1.05)),
  imperialdramon: u("Positron Laser", "🌌", "A galaxy-splitting shot for 400%.", bolt(4.0)),
  // Wormmon line
  stingmon: u("Spiking Strike", "🗡️", "Three piercing thrusts (120% each).", barrage(3, 1.2)),
  banchostingmon: u("Bancho Spear", "🥇", "A relentless five-hit combo (105% each).", barrage(5, 1.05)),
  // Guilmon line
  growlmon: u("Pyro Blaster", "🔥", "A blazing blast for 260%.", bolt(2.6)),
  gallantmon: u("Lightning Joust", "⚔️", "A lance strike (280%) that splashes (100%).", smite(2.8, 1.0, 1.6)),
  // Dorumon line
  dorugamon: u("Power Metal", "⚙️", "Fires an iron sphere for 255%.", bolt(2.55)),
  alphamon: u("Seiken Gradalpha", "👑", "The Royal Knight's blade erupts — AoE 185%.", nova(1.85, 2.0)),
  // Flamemon line (set 2)
  flamemon: u("Pyro Punch", "🔥", "A blazing punch for 270% attack.", bolt(2.7)),
  aldamon: u("Atomic Inferno", "☀️", "Fireballs rain on the target's area — AoE 155%.", nova(1.55, 1.7)),
  susanoomon: u("Amaterasu", "⚔️", "A sword of light (300%) that sweeps nearby foes (110%).", smite(3.0, 1.1, 1.8)),
  // bosses
  zeed: u("Time Unlimited", "⏳", "Stops time around the target: AoE 130%, frozen for 1.3s.", freeze(1.3, 2.2, 1.3)),
  gracenovamon: u("Grace Nova", "🌟", "A blade of every Royal Knight — AoE 200%.", nova(2.0, 2.2)),
  apollomon: u("Solblaster", "☀️", "Hurls the blazing sun from its back — AoE 180%.", nova(1.8, 2.0)),
  mitamamon: u("Kaijinraidou", "⚡", "Lightning from its eye that never misses — the 3 nearest (165%).", volley(3, 1.65)),
  // wild Digimon (set 3)
  coronamon: u("Corona Flame", "🔥", "A ball of fire for 260% attack.", bolt(2.6)),
  tapirmon: u("Nightmare Syndrome", "💤", "Releases its captured nightmares — AoE 140%.", nova(1.4, 1.6)),
  piximon: u("Bit Bomb", "💣", "A bat-shaped virus bomb bursts on the target — AoE 150%.", nova(1.5, 1.6)),
  // Herissmon line (Digimon ReArise)
  herissmon: u("Lightning Fur", "⚡", "Lightning-coated quills at the 3 nearest (120%).", volley(3, 1.2)),
  filmon: u("Crimson Slash", "🩸", "Claws that don't stop: three slashes (120% each).", barrage(3, 1.2)),
  rasenmon: u("Spiral Vanish", "🌀", "Spines fuse into a giant drill (300%) that tears through nearby foes (100%).", smite(3.0, 1.0, 1.6)),
  // ---- set 4 (Cyber Sleuth's files)
  // Agumon's Data Squad branch
  geogreymon: u("Mega Burst", "💥", "A blast from its mouth for 260% attack.", bolt(2.6)),
  rizegreymon: u("Trident Revolver", "🔫", "Its arm cannon fires at the 3 nearest (150%).", volley(3, 1.5)),
  shinegreymon: u("Glorious Burst", "☀️", "A sun of fire bursts around the target — AoE 180%.", nova(1.8, 2.0)),
  // Tentomon line
  kabuterimon: u("Electro Shocker", "⚡", "Lightning arcs to the 3 nearest (140%).", volley(3, 1.4)),
  megakabuterimon: u("Horn Buster", "🪲", "A charging horn and a shockwave — AoE 150%.", nova(1.5, 1.7)),
  herculeskabuterimon: u("Giga Blaster", "🌩️", "A storm of lightning around the target — AoE 200%.", nova(2.0, 1.8)),
  // Biyomon line
  birdramon: u("Meteor Wing", "☄️", "Fireballs rain on the 3 nearest (135%).", volley(3, 1.35)),
  garudamon: u("Wing Blade", "🦅", "A blade of fire (290%) that scorches nearby foes (100%).", smite(2.9, 1.0, 1.6)),
  hououmon: u("Starlight Explosion", "🌟", "A burst of holy starlight around the target — AoE 185%.", nova(1.85, 1.8)),
  // Terriermon line
  gargomon: u("Gargo Laser", "🔫", "Its gatling arms: three bursts (120% each).", barrage(3, 1.2)),
  rapidmon: u("Rapid Fire", "🚀", "Homing missiles at the 3 nearest (150%).", volley(3, 1.5)),
  megagargomon: u("Mega Barrage", "💣", "Every missile at once — AoE 150%.", nova(1.5, 1.8)),
  // Gaomon line
  gaogamon: u("Spiral Blow", "🌀", "A spinning dash for 255% attack.", bolt(2.55)),
  machgaogamon: u("Winning Knuckle", "🥊", "A rocket-powered punch for 300% attack.", bolt(3.0)),
  miragegaogamon: u("Full Moon Blaster", "🌕", "Moonlight from its chest at the 2 nearest (200%).", volley(2, 2.0)),
  // Falcomon line
  peckmon: u("Kunai Wing", "🪶", "Feather kunai: three hits (120% each).", barrage(3, 1.2)),
  crowmon: u("Sunshine Beam", "🔆", "A beam from its mirror — AoE 185%.", nova(1.85, 1.8)),
  ravemon: u("Blackwing", "🗡️", "A finishing slash: 260%, 420% below 30% HP.", execute(2.6, 0.3, 1.6)),
  // Renamon line
  kyubimon: u("Fox Tail Inferno", "🦊", "Blue fox-fire around the target — AoE 145%.", nova(1.45, 1.6)),
  taomon: u("Talisman of Light", "📜", "Talismans seal the area: AoE 120%, frozen for 1.2s.", freeze(1.2, 1.8, 1.2)),
  sakuyamon: u("Spirit Strike", "🌸", "Four fox spirits and her staff: five strikes (105% each).", barrage(5, 1.05)),
  // Agunimon line
  burninggreymon: u("Wildfire Tsunami", "🔥", "Flames from its arm cannons at the 3 nearest (135%).", volley(3, 1.35)),
  kaisergreymon: u("Dragon Fire Crossbow", "🏹", "A flaming bolt (300%) that sets nearby foes ablaze (110%).", smite(3.0, 1.1, 1.8)),
  // Lobomon line
  lobomon: u("Lobo Kendo", "⚔️", "A light-sabre flurry: three strikes (125% each).", barrage(3, 1.25)),
  kendogarurumon: u("Lightspeed Jamming", "💫", "Light-blade dashes: three strikes (120% each).", barrage(3, 1.2)),
  magnagarurumon: u("Magna Missile", "🚀", "Every missile in its armour at the 3 nearest (150%).", volley(3, 1.5)),
  // DemiDevimon's Devimon branch
  devimon: u("Touch of Evil", "🖐️", "A cursed touch seizes minds around the target: AoE 135%, frozen for 0.9s.", freeze(1.35, 1.6, 0.9)),
  myotismon: u("Grisly Wing", "🦇", "A swarm of bats drains the target: five bites (80% each, 25% lifesteal).", siphon(5, 0.8, 0.25)),
  ladydevimon: u("Darkness Wave", "🌑", "A wave of bats at the 3 nearest (140%).", volley(3, 1.4)),
  // Salamon line
  gatomon: u("Lightning Paw", "🐾", "A flurry of claw strikes: three hits (120% each).", barrage(3, 1.2)),
  angewomon: u("Celestial Arrow", "🏹", "An arrow of holy light for 400% attack.", bolt(4.0)),
  ophanimon: u("Eden's Javelin", "✨", "Javelins of light rain around the target — AoE 185%.", nova(1.85, 1.8)),
  silphymon: u("Static Force", "🌀", "A sphere of energy (290%) that bursts on nearby foes (100%).", smite(2.9, 1.0, 1.6)),
  // ---- set 6
  // Betamon line
  seadramon: u("Ice Arrow", "🧊", "Ice shards at the 3 nearest (130%).", volley(3, 1.3)),
  megaseadramon: u("Thunder Javelin", "⚡", "Lightning from its horn crashes around the target — AoE 185%.", nova(1.85, 1.8)),
  metalseadramon: u("River of Power", "🌊", "A beam from its nose cannon for 400% attack.", bolt(4.0)),
  // Elecmon line
  leomon: u("Fist of the Beast King", "🦁", "A lion-shaped blast for 260% attack.", bolt(2.6)),
  panjyamon: u("Fist of the Ice Beast", "❄️", "An ice fist (290%) that chills the foes around (100%).", smite(2.9, 1.0, 1.6)),
  saberleomon: u("Howling Crusher", "🐆", "A flurry of claws: five strikes (105% each).", barrage(5, 1.05)),
  // Mushroomon line
  woodmon: u("Branch Drill", "🌳", "A spinning branch for 250% attack.", bolt(2.5)),
  cherrymon: u("Cherry Bomb", "🍒", "Exploding cherries burst around the target — AoE 185%.", nova(1.85, 1.8)),
  puppetmon: u("Bullet Hammer", "🔨", "Its hammer fires at the 3 nearest (150%).", volley(3, 1.5)),
  // Monodramon line
  strikedramon: u("Strike Fang", "🔥", "A blazing tackle: three strikes (120% each).", barrage(3, 1.2)),
  cyberdramon: u("Desolation Claw", "🐉", "A claw of pure force (300%) that tears through nearby foes (100%).", smite(3.0, 1.0, 1.6)),
  justimon: u("Justice Kick", "🦵", "A finishing kick: 260%, 420% below 30% HP.", execute(2.6, 0.3, 1.6)),
  // Lunamon line
  lekismon: u("Tear Arrow", "🏹", "Arrows of moonlit water at the 3 nearest (130%).", volley(3, 1.3)),
  crescemon: u("Lunatic Dance", "🌙", "A dance of crescent blades: five strikes (105% each).", barrage(5, 1.05)),
  dianamon: u("Good Night Moon", "🌕", "Moonlight lulls the area to sleep: AoE 120%, frozen for 1.2s.", freeze(1.2, 1.8, 1.2)),
  // Support rally on a couple of casters keeps team comps interesting
  candlemon: u("Ember Rally", "🕯️", "Ignites allies: +30% attack for the battle.", rally(0.3)),
  // rookies whose element synergies fit them badly (or too well) get their own moves
  gomamon: u("Marching Fishes", "🐟", "A school of fish rams the target twice (100% each).", barrage(2, 1.0)),
  dracomon: u("Baby Breath", "🔥", "A breath of fire for 190% attack.", bolt(1.9)),
  gabumon: u("Blue Blaster", "🔵", "A blue flame for 290% attack.", bolt(2.9)),
  veemon: u("Vee Headbutt", "💢", "A charging headbutt for 290% attack.", bolt(2.9)),
};

/** Resolve a form's ultimate, falling back to its role ability. */
export function ultimateFor(formId: string, role: Role): Ultimate {
  return ULTIMATES[formId] ?? ROLE_ULT[role];
}
