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

/** Two effects in one cast. */
const both = (a: Effect, b: Effect): Effect => ({
  fx: b.fx,
  cast: (c) => {
    a.cast(c);
    b.cast(c);
  },
});

/** Swords at the nearest few that pin each where it stands (Piedmon's Trump Sword). */
const pin = (count: number, factor: number, seconds: number): Effect => ({
  fx: "barrage",
  cast: (c) => {
    const ts = [...c.enemies].sort((a, b) => c.dist(c.caster, a) - c.dist(c.caster, b)).slice(0, count);
    for (const t of ts) {
      c.deal(t, factor);
      c.stun(t, seconds);
    }
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
  blitzgreymon: u("Blitz Barrage", "💥", "Missiles at the 3 nearest foes (145%).", volley(3, 1.45)),
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
  dorugamon: u("Power Metal", "⚙️", "Fires an iron sphere for 190%.", bolt(1.9)),
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
  tapirmon: u("Bad Dream", "💤", "Releases its captured nightmares — AoE 140%.", nova(1.4, 1.6)),
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
  ravemon: u("Blackwing", "🗡️", "Four slashes that feed it (110% each, 35% lifesteal).", siphon(4, 1.1, 0.35)),
  // Renamon line
  kyubimon: u("Fox Tail Inferno", "🦊", "Blue fox-fire around the target — AoE 145%.", nova(1.45, 1.6)),
  taomon: u("Talisman of Light", "📜", "Talismans seal the area: AoE 120%, frozen for 1.2s.", freeze(1.2, 1.8, 1.2)),
  sakuyamon: u("Spirit Strike", "🌸", "Four fox spirits and her staff: five strikes (100% each).", barrage(5, 1.0)),
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
  // ---- set 7
  // Armadillomon line
  ankylomon: u("Tail Hammer", "🦖", "Braces behind a 20% shield.", bulwark(0.2)),
  shakkoumon: u("Kachina Bombs", "💣", "Clay bombs burst around the target — AoE 185%.", nova(1.85, 1.8)),
  groundramon: u("Rock Breaker", "🪨", "A quake (290%) that shakes the foes around it (100%).", smite(2.9, 1.0, 1.6)),
  // Gotsumon line
  golemon: u("Crystal Stone", "💎", "Hardens behind a 21% shield.", bulwark(0.21)),
  volcanomon: u("Volcano Strike", "🌋", "Molten rocks at the 3 nearest (140%).", volley(3, 1.4)),
  pumpkinmon: u("Trick or Treat", "🎃", "A cursed prank: AoE 120%, frozen for 1.2s.", freeze(1.2, 1.8, 1.2)),
  // Goblimon line
  ogremon: u("Pummel Whack", "🦴", "A bone-club smash for 260% attack.", bolt(2.6)),
  weregarurumon: u("Wolf Claw", "🐺", "Claws of a wolf warrior: four slashes (130% each).", barrage(4, 1.3)),
  // Impmon line
  wizardmon: u("Thunder Ball", "⚡", "A ball of lightning for 250% attack.", bolt(2.5)),
  bakemon: u("Dark Claw", "👻", "Ghostly claws: three strikes (120% each).", barrage(3, 1.2)),
  wisemon: u("Pendulum Ray", "🔮", "Rays from its Spheres of Ether rain around the target — AoE 185%.", nova(1.85, 1.8)),
  phantomon: u("Shadow Scythe", "💀", "A reaping scythe: 260%, 420% below 30% HP.", execute(2.6, 0.3, 1.6)),
  // Hawkmon line
  aquilamon: u("Blast Rings", "💫", "Rings of energy at the 3 nearest (130%).", volley(3, 1.3)),
  hippogryphonmon: u("Rapid Wing", "🪶", "Razor feathers at the 3 nearest (150%).", volley(3, 1.5)),
  aeroveedramon: u("Dragon Impulse", "🐉", "A dragon of energy (300%) that tears through nearby foes (100%).", smite(3.0, 1.0, 1.6)),
  // new branches
  zudomon: u("Vulcan's Hammer", "🔨", "A hammer blow (290%) that shakes the foes around (100%).", smite(2.9, 1.0, 1.6)),
  andromon: u("Lightning Blade", "⚡", "A blade of lightning for 400% attack.", bolt(4.0)),
  // ---- set 8
  // Kudamon line
  reppamon: u("Kamaitachi", "🌪️", "Blades of wind: three strikes (120% each).", barrage(3, 1.2)),
  chirinmon: u("Holy Hoof", "✨", "Holy light rains around the target — AoE 185%.", nova(1.85, 1.8)),
  // Lalamon line
  sunflowmon: u("Solar Ray", "🌻", "A beam of sunlight for 250% attack.", bolt(2.5)),
  lilamon: u("Lila Shower", "🌸", "Petal beams at the 3 nearest (150%).", volley(3, 1.5)),
  // Otamamon line
  gekomon: u("Symphony Crusher", "🎺", "A blast of sound stuns the area: AoE 135%, frozen for 0.9s.", freeze(1.35, 1.6, 0.9)),
  shogungekomon: u("Musical Fist", "🎶", "A war song: every ally behind a 6% shield.", bulwark(0.06, true)),
  whamon: u("Tidal Wave", "🌊", "A tidal wave: AoE 110% and freezes for 1s.", freeze(1.1, 1.8, 1.0)),
  // branches
  metalgreymon: u("Giga Destroyer", "🚀", "Missiles from its chest at the 3 nearest (150%).", volley(3, 1.5)),
  skullgreymon: u("Ground Zero", "💀", "A missile from its spine (300%) that blasts nearby foes (100%).", smite(3.0, 1.0, 1.6)),
  wargrowlmon: u("Atomic Blaster", "💥", "Twin cannons for 400% attack.", bolt(4.0)),
  metaltyrannomon: u("Nuclear Laser", "☢️", "A laser (290%) that scorches the foes around (100%).", smite(2.9, 1.0, 1.6)),
  lillymon: u("Flower Cannon", "🌺", "A cannon of petals for 400% attack.", bolt(4.0)),
  grapleomon: u("Lion's Roar", "🦁", "Lion fists: five strikes (105% each).", barrage(5, 1.05)),
  // ---- set 10
  lucemon: u("Grand Cross", "✝️", "Ten spheres of light in a cross — AoE 150%.", nova(1.5, 1.6)),
  sukamon: u("Junk Throw", "💩", "Hurls something unspeakable for 240% attack.", bolt(2.4)),
  numemon: u("Nume-Sludge", "🐌", "Sticky sludge glues the area: AoE 120%, stuck for 0.8s.", freeze(1.2, 1.4, 0.8)),
  etemon: u("Love Serenade", "🎤", "A song so bad it stuns: AoE 120%, frozen for 1.2s.", freeze(1.2, 1.8, 1.2)),
  monzaemon: u("Hearts Attack", "💖", "Hearts of love: every ally behind a 7% shield.", bulwark(0.07, true)),
  waspmon: u("Turbo Stinger", "🐝", "Stingers at the 3 nearest (130%).", volley(3, 1.3)),
  cannonbeemon: u("Cannon Bomb", "💣", "Bombs rain around the target — AoE 185%.", nova(1.85, 1.8)),
  antylamon: u("Bulb Ax", "🪓", "Axe arms: 260%, 420% below 30% HP.", execute(2.6, 0.3, 1.6)),
  datamon: u("Digital Bomb", "💾", "A data bomb (290%) that bursts on the foes around (100%).", smite(2.9, 1.0, 1.6)),
  dinobeemon: u("Hell Masquerade", "🦂", "A storm of stings: five strikes (105% each).", barrage(5, 1.05)),
  // ---- every rookie by name: the mechanics of its role's default (no balance change), the anime's attack
  agumon: u("Pepper Breath", "🔥", "A fireball for 250% attack.", bolt(2.5)),
  guilmon: u("Pyro Sphere", "🔥", "A ball of fire for 250% attack.", bolt(2.5)),
  dorumon: u("Metal Cannon", "⚙️", "An iron sphere for 250% attack.", bolt(2.5)),
  gaomon: u("Gao Rush", "🥊", "A rush of punches for 250% attack.", bolt(2.5)),
  agunimon: u("Pyro Tornado", "🔥", "A flaming punch for 250% attack.", bolt(2.5)),
  elecmon: u("Super Thunder Strike", "⚡", "Lightning from its tails for 250% attack.", bolt(2.5)),
  monodramon: u("Beat Knuckle", "👊", "A knuckle blow for 250% attack.", bolt(2.5)),
  gotsumon: u("Rock Fist", "🪨", "A stone fist for 250% attack.", bolt(2.5)),
  goblimon: u("Goblin Strike", "🔥", "A fireball from its club for 250% attack.", bolt(2.5)),
  zubamon: u("Zuba Edge", "🗡️", "A blade's edge for 250% attack.", bolt(2.5)),
  hagurumon: u("Darkness Gear", "⚙️", "Braces behind an 18% shield.", bulwark(0.18)),
  syakomon: u("Clam Shell", "🐚", "Hides behind an 18% shield.", bulwark(0.18)),
  falcomon: u("Ninja Blade", "🥷", "Shuriken and talons: three strikes (115% each).", barrage(3, 1.15)),
  renamon: u("Diamond Storm", "💎", "Diamond shards: three strikes (115% each).", barrage(3, 1.15)),
  chuumon: u("Chu Bat", "🐭", "Bonks with its stick: three strikes (115% each).", barrage(3, 1.15)),
  hackmon: u("Baby Claw", "🐾", "A flurry of claws: three strikes (115% each).", barrage(3, 1.15)),
  dracmon: u("Undead Bite", "🧛", "Fangs: three strikes (115% each).", barrage(3, 1.15)),
  gazimon: u("Stun Claw", "🐰", "Electric claws: three strikes (115% each).", barrage(3, 1.15)),
  patamon: u("Boom Bubble", "🫧", "Air bubbles at the 3 nearest (130%).", volley(3, 1.3)),
  tentomon: u("Super Shocker", "⚡", "Sparks at the 3 nearest (130%).", volley(3, 1.3)),
  terriermon: u("Bunny Blast", "💨", "Air shots at the 3 nearest (130%).", volley(3, 1.3)),
  hawkmon: u("Feather Strike", "🪶", "Feathers at the 3 nearest (130%).", volley(3, 1.3)),
  kudamon: u("Holy Shot", "✨", "Holy bullets at the 3 nearest (130%).", volley(3, 1.3)),
  lalamon: u("Seed Blast", "🌱", "Seeds at the 3 nearest (130%).", volley(3, 1.3)),
  fanbeemon: u("Mini Stinger", "🐝", "Stingers at the 3 nearest (130%).", volley(3, 1.3)),
  toyagumon: u("Plastic Blaze", "🧸", "Toy flames at the 3 nearest (130%).", volley(3, 1.3)),
  sistermonblanc: u("Cure Shot", "🔫", "Shots at the 3 nearest (130%).", volley(3, 1.3)),
  demidevimon: u("Demi Dart", "💉", "A hail of darts around the target — AoE 145%.", nova(1.45, 1.6)),
  keramon: u("Bug Blaster", "🪲", "A burst of bugs around the target — AoE 145%.", nova(1.45, 1.6)),
  palmon: u("Poison Ivy", "🌿", "Vines lash around the target — AoE 145%.", nova(1.45, 1.6)),
  biyomon: u("Spiral Twister", "🌀", "A spiral of green flame around the target — AoE 145%.", nova(1.45, 1.6)),
  betamon: u("Electric Shock", "⚡", "A shock around the target — AoE 145%.", nova(1.45, 1.6)),
  mushroomon: u("Laughing Fungus", "🍄", "Spores burst around the target — AoE 145%.", nova(1.45, 1.6)),
  lunamon: u("Lop-Ear Ripple", "🌊", "Bubbles ripple around the target — AoE 145%.", nova(1.45, 1.6)),
  impmon: u("Bada Boom", "💥", "Fireballs burst around the target — AoE 145%.", nova(1.45, 1.6)),
  otamamon: u("Lullaby Bubble", "🫧", "Bubbles burst around the target — AoE 145%.", nova(1.45, 1.6)),
  // ---- set 11
  airdramon: u("Spinning Needle", "🌪️", "Razor winds at the 3 nearest (130%).", volley(3, 1.3)),
  baohuckmon: u("Fifth Lancer", "🗡️", "Lance thrusts: three strikes (120% each).", barrage(3, 1.2)),
  clockmon: u("Chrono Breaker", "⏱️", "Time stops around the target: AoE 135%, frozen for 0.9s.", freeze(1.35, 1.6, 0.9)),
  coelamon: u("Fossil Shell", "🐚", "Braces behind a 20% shield.", bulwark(0.2)),
  cyclonemon: u("Hyper Heat", "🔥", "A blast of heat for 250% attack.", bolt(2.5)),
  frigimon: u("Subzero Ice Punch", "❄️", "An icy punch: AoE 120%, frozen for 0.8s.", freeze(1.2, 1.4, 0.8)),
  hudiemon: u("Scale Dust", "🦋", "Glittering dust bursts around the target — AoE 140%.", nova(1.4, 1.6)),
  icemon: u("Ice Ball Bomb", "🧊", "Hurls ice: AoE 120%, frozen for 0.8s.", freeze(1.2, 1.4, 0.8)),
  kurisarimon: u("Data Crusher", "🕸️", "Crushing data bursts around the target — AoE 140%.", nova(1.4, 1.6)),
  kuwagamon: u("Scissor Claw", "✂️", "Pincers: 220%, 350% below 30% HP.", execute(2.2, 0.3, 1.6)),
  monochromon: u("Volcanic Strike", "🌋", "A fireball from its mouth for 240% attack.", bolt(2.4)),
  mudfrigimon: u("Mud Armor", "🟫", "Braces behind a 20% shield.", bulwark(0.2)),
  nanimon: u("Sake Punch", "🥊", "A wild punch for 250% attack.", bolt(2.5)),
  platinumsukamon: u("Platinum Junk", "💩", "Shining junk rains around the target — AoE 140%.", nova(1.4, 1.6)),
  raptordramon: u("Talon Rush", "🦖", "A rush of talons: three strikes (120% each).", barrage(3, 1.2)),
  raremon: u("Toxic Sludge", "☠️", "Sludge splashes around the target — AoE 140%.", nova(1.4, 1.6)),
  sangloupmon: u("Blood Fang", "🩸", "Three bites that feed it (100% each, 30% lifesteal).", siphon(3, 1.0, 0.3)),
  shellnumemon: u("Shell Guard", "🐌", "Hides behind a 20% shield.", bulwark(0.2)),
  sistermonnoir: u("Dual Pistols", "🔫", "Shots at the 3 nearest (130%).", volley(3, 1.3)),
  starmon: u("Meteor Squall", "🌠", "Little meteors at the 3 nearest (130%).", volley(3, 1.3)),
  tankmon: u("Hyper Cannon", "🎯", "A cannon shell for 260% attack.", bolt(2.6)),
  turuiemon: u("Rabbit Kick", "🐰", "A flurry of kicks: three strikes (120% each).", barrage(3, 1.2)),
  tyrannomon: u("Blaze Blast", "🔥", "A blast of flame for 250% attack.", bolt(2.5)),
  unimon: u("Aerial Attack", "💫", "Spheres of light at the 3 nearest (130%).", volley(3, 1.3)),
  veedramon: u("V-Nova Blast", "💥", "A V-shaped blast for 260% attack.", bolt(2.6)),
  vegiemon: u("Root Bind", "🥕", "Roots bind the area: AoE 120%, held for 0.8s.", freeze(1.2, 1.4, 0.8)),
  zubaeagermon: u("Eagle Blade", "🦅", "Wing blades: three strikes (120% each).", barrage(3, 1.2)),
  flamedramon: u("Fire Rocket", "🔥", "A blazing dive for 260% attack.", bolt(2.6)),
  catchmamemon: u("Catch Bomb", "💣", "A bomb (290%) that bursts on the foes around (100%).", smite(2.9, 1.0, 1.6)),
  digitamamon: u("Nightmare Syndrome", "🥚", "Darkness spills from the egg: AoE 120%, frozen for 1.2s.", freeze(1.2, 1.8, 1.2)),
  dragomon: u("Forbidden Trident", "🔱", "A trident (290%) whose curse hits the foes around (100%).", smite(2.9, 1.0, 1.6)),
  duramon: u("Duram Blade", "🗡️", "A blade strike: 260%, 420% below 30% HP.", execute(2.6, 0.3, 1.6)),
  grademon: u("Cross Slash", "⚔️", "Twin swords: five strikes (105% each).", barrage(5, 1.05)),
  knightmon: u("Berserk Sword", "🛡️", "A great sword (260%) that shakes the foes around (100%).", smite(2.6, 1.0, 1.6)),
  mamemon: u("Smiley Bomb", "💣", "A tiny bomb, a huge blast around the target — AoE 185%.", nova(1.85, 1.8)),
  matadormon: u("Flecha de Sangre", "🩸", "Four thrusts that feed it (110% each, 30% lifesteal).", siphon(4, 1.1, 0.3)),
  megadramon: u("Genocide Attack", "🚀", "Organic missiles at the 3 nearest (150%).", volley(3, 1.5)),
  metalmamemon: u("Energy Bomb", "⚡", "An energy blast for 360% attack.", bolt(3.6)),
  okuwamon: u("Double Scissor Claw", "✂️", "Four pincers: five strikes (115% each).", barrage(5, 1.15)),
  pandamon: u("Bamboo Smash", "🐼", "A smash (290%) that shakes the foes around (100%).", smite(2.9, 1.0, 1.6)),
  saviorhuckmon: u("Savior Crash", "🔥", "A blazing charge (300%) that tears through nearby foes (100%).", smite(3.0, 1.0, 1.6)),
  superstarmon: u("Meteor Shower", "🌠", "Meteors rain around the target — AoE 185%.", nova(1.85, 1.8)),
  triceramon: u("Tri-Horn Attack", "🦏", "A horn charge (260%) that shakes the foes around (100%).", smite(2.6, 1.0, 1.6)),
  vademon: u("UFO Ray", "👽", "An abduction ray: AoE 120%, frozen for 1.2s.", freeze(1.2, 1.8, 1.2)),
  wingdramon: u("Sonic Raid", "💨", "A sonic blast for 400% attack.", bolt(4.0)),
  bancholeomon: u("Burning Bancho Punch", "👊", "A burning punch (300%) that blasts nearby foes (100%).", smite(3.0, 1.0, 1.6)),
  barbamon: u("Pandemonium Lost", "💰", "Greed's hellfire bursts around the target — AoE 185%.", nova(1.85, 1.8)),
  boltmon: u("Tomahawk Stinger", "🪓", "An axe blow: 260%, 420% below 30% HP.", execute(2.6, 0.3, 1.6)),
  chaosdramon: u("Hyper Infinity Cannon", "🎯", "One annihilating shot for 420% attack.", bolt(4.2)),
  craniamon: u("Avalon", "🛡️", "The holy shield: every ally behind a 7% shield.", bulwark(0.07, true)),
  creepymon: u("Cruel Bullet", "😈", "Dark bullets burst around the target — AoE 185%.", nova(1.85, 1.8)),
  crusadermon: u("Spiral Masquerade", "🎀", "Ribbon blades: five strikes (105% each).", barrage(5, 1.05)),
  darkdramon: u("Darkness Rode", "🔫", "Shells at the 3 nearest (150%).", volley(3, 1.5)),
  dorugoramon: u("Brave Metal", "💥", "Iron spheres (300%) that tear through nearby foes (100%).", smite(3.0, 1.0, 1.6)),
  durandamon: u("Durandal", "⚔️", "The holy blade: 260%, 420% below 30% HP.", execute(2.6, 0.3, 1.6)),
  dynasmon: u("Dragon's Roar", "🐉", "A dragon of light (300%) that tears through nearby foes (100%).", smite(3.0, 1.0, 1.6)),
  ebemon: u("Brain Rupture", "🧠", "A psychic wave: AoE 120%, stunned for 1.2s.", freeze(1.2, 1.8, 1.2)),
  gaiomon: u("Meteor Saber", "🗡️", "Twin blades: 280%, 450% below 30% HP.", execute(2.8, 0.3, 1.6)),
  grandracmon: u("Blood Moon", "🦇", "Five drains (80% each, 30% lifesteal).", siphon(5, 0.8, 0.3)),
  grankuwagamon: u("Dimension Scissor", "✂️", "Cuts through space: five strikes (105% each).", barrage(5, 1.05)),
  groundlocomon: u("Locomotive Cannon", "🚂", "Cannons at the 3 nearest (150%).", volley(3, 1.5)),
  gryphonmon: u("Great Tempest", "🌪️", "A tempest crashes around the target — AoE 185%.", nova(1.85, 1.8)),
  hiandromon: u("Atomic Ray", "⚛️", "An atomic ray for 400% attack.", bolt(4.0)),
  jesmon: u("Aurora Blades", "🗡️", "Blades of light: five strikes (105% each).", barrage(5, 1.05)),
  kentaurosmon: u("Hunting Cannon", "🏹", "Arrows of light at the 3 nearest (150%).", volley(3, 1.5)),
  kingetemon: u("Dark Spirits DX", "🎤", "The king's song stuns: AoE 120%, frozen for 1.2s.", freeze(1.2, 1.8, 1.2)),
  leopardmon: u("Aufgabe", "🐆", "A fatal thrust: 280%, 450% below 30% HP.", execute(2.8, 0.3, 1.6)),
  leviamon: u("Rostrum", "🐊", "Jaws (260%) that shake the foes around (100%).", smite(2.6, 1.0, 1.6)),
  lilithmon: u("Phantom Pain", "💅", "Five drains (80% each, 25% lifesteal).", siphon(5, 0.8, 0.25)),
  lotosmon: u("Serpent Bind", "🪷", "Serpents bind the area: AoE 120%, held for 1.2s.", freeze(1.2, 1.8, 1.2)),
  marineangemon: u("Ocean Love", "💖", "Bubbles of love: every ally behind an 8% shield, and they burst on the foes (AoE 130%).", both(bulwark(0.08, true), nova(1.3, 1.8))),
  motimon: u("Bubble Blow", "🫧", "Bubbles burst around the target — AoE 160%.", nova(1.6, 1.6)),
  mastemon: u("Judgment Gate", "⚖️", "Light and darkness burst around the target — AoE 185%.", nova(1.85, 1.8)),
  megidramon: u("Megiddo Flame", "🔥", "Hellfire bursts around the target — AoE 185%.", nova(1.85, 1.8)),
  merukimon: u("Mercurial Mirror", "🪞", "A mirror shield: every ally behind a 7% shield.", bulwark(0.07, true)),
  metaletemon: u("Metal Punch", "🐒", "A metal fist (300%) that blasts nearby foes (100%).", smite(3.0, 1.0, 1.6)),
  minervamon: u("Olympic Blade", "⚔️", "A goddess's sword: five strikes (105% each).", barrage(5, 1.05)),
  neptunemon: u("Ocean Storm", "🌊", "A storm of the sea around the target — AoE 185%.", nova(1.85, 1.8)),
  pilevolcamon: u("Pile Bomber", "💥", "A volcanic pile (300%) that blasts nearby foes (100%).", smite(3.0, 1.0, 1.6)),
  plesiomon: u("Sweet Wave", "🌊", "A wave: AoE 110% and freezes for 1s.", freeze(1.1, 1.8, 1.0)),
  princemamemon: u("Smiley Warhead", "💣", "A royal bomb bursts around the target — AoE 185%.", nova(1.85, 1.8)),
  rusttyranomon: u("Rust Cannon", "🦖", "Rusted cannons at the 3 nearest (150%).", volley(3, 1.5)),
  slayerdramon: u("Tenryu Zan", "🐉", "A dragon slayer's cut: 280%, 450% below 30% HP.", execute(2.8, 0.3, 1.6)),
  tigervespamon: u("Royal Saber", "🐝", "Twin sabres: five strikes (105% each).", barrage(5, 1.05)),
  titamon: u("Soul Crusher", "💀", "A giant's club (300%) that crushes nearby foes (100%).", smite(3.0, 1.0, 1.6)),
  tyrantkabuterimon: u("Grand Electro", "⚡", "Lightning crashes around the target — AoE 185%.", nova(1.85, 1.8)),
  ulforceveedramon: u("Shining V Force", "💫", "Victory blades: five strikes (105% each).", barrage(5, 1.05)),
  valkyrimon: u("Fenrir Sword", "⚔️", "A winged sword: 280%, 450% below 30% HP.", execute(2.8, 0.3, 1.6)),
  varodurumon: u("Sun Feather", "🪶", "Burning feathers at the 3 nearest (150%).", volley(3, 1.5)),
  venommyotismon: u("Venom Infuse", "🦇", "Five venomous bites (80% each, 30% lifesteal).", siphon(5, 0.8, 0.3)),
  armageddemon: u("Ultimate Flare", "☄️", "A flare engulfs the area around the target — AoE 195%.", nova(1.95, 1.9)),
  chaosmon: u("Chaos Destroyer", "🌀", "A blow of chaos (310%) that tears through nearby foes (100%).", smite(3.1, 1.0, 1.6)),
  examon: u("Pendragon's Glory", "🐉", "A dragon lance for 420% attack.", bolt(4.2)),
  // ---- the final boss (boss only): Lucemon, in two phases
  lucemonfm: u("Dead or Alive", "☯️", "A sphere of light and one of darkness: AoE 170%, and he hides behind a 12% shield.", both(bulwark(0.12), nova(1.7, 2.0))),
  lucemonsm: u("Paradise Lost", "😈", "Slams the target (260%, 420% below 30% HP); the shockwave hits around it (120%).", both(execute(2.6, 0.3, 1.6), nova(1.2, 1.8))),
  // ---- the Dark Masters' leader (boss only)
  piedmon: u("Trump Sword", "🃏", "Four swords at the 4 nearest (140%), each pinned for 0.7s.", pin(4, 1.4, 0.7)),
  // ---- set 9: the anime's finals
  skullmeramon: u("Metal Fireball", "🔥", "A fireball of blue flame (290%) that scorches the foes around (100%).", smite(2.9, 1.0, 1.6)),
  dorugreymon: u("Exa Blaster", "💥", "A blast (300%) that tears through nearby foes (100%).", smite(3.0, 1.0, 1.6)),
  seraphimon: u("Seven Heavens", "✨", "Seven orbs of holy light burst around the target — AoE 185%.", nova(1.85, 1.8)),
  magnadramon: u("Fire Tornado", "🐲", "Holy fire spirals at the 3 nearest (150%).", volley(3, 1.5)),
  magnamon: u("Extreme Jihad", "🛡️", "Its golden armour blazes: every ally behind a 6% shield.", bulwark(0.06, true)),
  omnimon: u("Transcendent Sword", "⚔️", "A sword of light: 260%, 420% below 30% HP.", execute(2.6, 0.3, 1.6)),
  // Support rally on a couple of casters keeps team comps interesting
  candlemon: u("Ember Rally", "🕯️", "Ignites allies: +30% attack for the battle.", rally(0.3)),
  // rookies whose element synergies fit them badly (or too well) get their own moves
  gomamon: u("Marching Fishes", "🐟", "A school of fish rams the target twice (100% each).", barrage(2, 1.0)),
  dracomon: u("Baby Breath", "🔥", "A breath of fire for 150% attack.", bolt(1.5)),
  salamon: u("Puppy Howl", "🐶", "A howl that rings around the target — AoE 175%.", nova(1.75, 1.6)),
  wormmon: u("Sticky Net", "🕸️", "Spins a 15% shield, and a net binds the area: AoE 100%, stuck for 0.8s.", both(bulwark(0.15), freeze(1.0, 1.6, 0.8))),
  armadillomon: u("Diamond Shell", "🛡️", "Curls up behind a 12% shield.", bulwark(0.12)),
  gabumon: u("Blue Blaster", "🔵", "A blue flame for 290% attack.", bolt(2.9)),
  veemon: u("Vee Headbutt", "💢", "A charging headbutt for 290% attack.", bolt(2.9)),
};

/** Resolve a form's ultimate, falling back to its role ability. */
export function ultimateFor(formId: string, role: Role): Ultimate {
  return ULTIMATES[formId] ?? ROLE_ULT[role];
}
