// Core game types. Renderer-agnostic on purpose: when Colyseus takes over,
// this is roughly the schema the server would own.

/** Free = no attribute (the babies): outside the counter triangle, no synergy. */
export type Attribute = "Vaccine" | "Data" | "Virus" | "Free";

/** Cyber Sleuth's elements: every species has one — the synergy axis next to the attribute
 *  triangle. Neutral (most Fresh babies) counts for no synergy. */
export type Element = "Fire" | "Water" | "Plant" | "Electric" | "Earth" | "Wind" | "Light" | "Dark" | "Neutral";

/** Evolution stage — also the shop tier and the price: 1 Fresh, 2 In-Training,
 *  3 Rookie, 4 Champion, 5 Mega (Ultimates live here too). */
export type Stage = 1 | 2 | 3 | 4 | 5;

/** Combat archetype — drives stats via a (role, stage) table. */
export type Role = "tank" | "bruiser" | "assassin" | "ranged" | "caster";

/**
 * A single Digimon form (a node in the digivolution graph). Its stage is its price:
 * Fresh, In-Training and Rookies are always in the shop; a Champion or Mega shows up
 * there once the player has raised it this game (discovery).
 * `evolvesTo` lists the next-stage branches — >1 means the player chooses.
 */
export interface Form {
  id: string;
  name: string;
  stage: Stage;
  attribute: Attribute;
  element: Element;
  role: Role;
  evolvesTo?: string[];
  /** appears only as a boss: never in the shop, wild waves or scrims */
  bossOnly?: boolean;
  /** a wild Digimon: met in PvE waves, never in the shop, a player's board or scrims */
  wild?: boolean;
}

/** A unit instance the player owns (on bench or board). */
export interface Unit {
  uid: string;
  formId: string;
  placement: Placement;
  /** equipped item ids (max 2), persist through digivolution */
  items: string[];
  /** the shop copies merged into it (unset: one of its own form, as bought) — what it
   *  holds of the VS pool and what selling it returns */
  parts?: Record<string, number>;
  /** a Mega's star level: three copies of a Mega star it up (unset: ★) */
  star?: 2 | 3;
}

export type Placement =
  | { kind: "bench"; slot: number }
  | { kind: "board"; col: number; row: number };

/** A pending digivolution waiting on the player to pick a branch. */
export interface PendingEvolution {
  fromFormId: string;
  /** the 3 unit uids being consumed */
  consume: string[];
  /** candidate next-stage form ids to choose from */
  options: string[];
  /** where the evolved unit will be placed */
  placement: Placement;
}

/** A combatant snapshot used only during the battle simulation. */
export interface Fighter {
  uid: string;
  formId: string;
  team: "player" | "enemy";
  attribute: Attribute;
  role: Role;
  hp: number;
  maxHp: number;
  attack: number;
  attackSpeed: number;
  range: number;
  col: number;
  row: number;
  cooldown: number;
  /** an attack under way: seconds of wind-up left until the blow lands (the model's contact
   *  frame) — or, ranged, until the shot leaves — and on whom */
  swing?: number;
  swingAt?: string;
  /** shots in flight: each lands on its target when `left` runs out */
  shots?: { tgt: string; left: number; raw: number; mult: number }[];
  moving: boolean;
  targetUid: string | null;
  /** ability resource: gained on attack/hit; casts the role ability when full */
  mana: number;
  maxMana: number;
  /** temporary absorb applied before hp (tank ability) */
  shield: number;
  /** fraction of dealt damage returned as healing (items) */
  lifesteal: number;
  /** multiplier on mana gain (items) */
  manaMult: number;
  /** fused items: fraction of incoming damage ignored, shield on cast (fraction of
   *  max HP) and regeneration per second (fraction of max HP) */
  dmgReduction: number;
  castShield: number;
  regen: number;
  /** seconds of stun remaining (frozen ultimates); blocks all action while > 0 */
  stunned: number;
  /** bumped every time this fighter casts its ultimate — drives the special01 animation */
  castKey: number;
  /** true for the oversized boss unit on boss rounds (visual + reward) */
  boss?: boolean;
  /** equipped item ids (cosmetic reference; Digimentals count in synergies) */
  items: string[];
  /** item mechanics of their own (the unique fused items), set by applyItems */
  procs?: Procs;
  /** seconds its healing stays halved (Black Gear) */
  wounded?: number;
  /** Fire's burn on it: damage a second, seconds left, the burner's uid, time to the next pulse */
  burnDps?: number;
  burnLeft?: number;
  burnSrc?: string;
  burnPulse?: number;
  /** a Mega's star level (stats baked in by makeFighter; the pips show it) */
  star?: number;
  /** a final boss's second phase: when this one falls, that form rises in its place — or, in
   *  the Primary Village mode (`hatch`), its line's baby hatches there */
  rebirth?: { formId: string; maxHp: number; attack: number; hatch?: boolean };
  /** a boss's own mechanic (battle.ts): the Eater devours the weakest of the other side, the
   *  Mother Eater broods Eater Bits that shield her */
  mech?: "devour" | "brood";
  /** seconds to the mechanic's next turn; how many it has brooded; the health scale of its
   *  brood (the round's) */
  mechT?: number;
  mechN?: number;
  mechScale?: number;
  /** the Mother Eater with Bits alive: half damage */
  broodGuard?: boolean;
}

/** Unique item mechanics on a fighter. Static knobs come from items.ts; the running
 *  counters below them are kept by battle.ts during the fight. */
export interface Procs {
  /** Crest of Knowledge: ultimate damage multiplier */
  ultPower?: number;
  /** Spike Shell: share of an attack's damage struck back at the attacker */
  reflect?: number;
  /** Crest of Reliability: a shield (share of max HP) the first time HP drops below 40% */
  rescue?: number;
  /** Rage Chip: attack speed gained with every attack, up to rampMax (shares of the start) */
  ramp?: number;
  rampMax?: number;
  /** Lightning Coil: every chainEvery-th attack also strikes every enemy near the target */
  chainEvery?: number;
  chainFactor?: number;
  /** Blue Card: share of max mana kept after a cast */
  castRefund?: number;
  /** Crest of Sincerity: share of attack damage healed to the most wounded ally */
  allyHeal?: number;
  /** Crest of Love: heal on cast (share of max HP) */
  castHeal?: number;
  /** Crest of Courage: attack gained per hit dealt or taken, up to courageMax */
  courage?: number;
  courageMax?: number;
  /** Holy Ring: seconds left that freezes don't take */
  ccImmune?: number;
  /** Black Gear: seconds of halved healing its hits leave */
  wounding?: number;
  /** Fire: its attacks set the target burning for this share of its attack a second (3 s) */
  burn?: number;
  /** Wind: every dodgeEvery-th moment it's attacked, the attacks miss */
  dodgeEvery?: number;
  /** Light: every cast shields the most wounded ally for this share of its own max HP */
  blessing?: number;
  // running state
  attacks?: number;
  ramped?: number;
  braved?: number;
  dodgeCount?: number;
}

export type Phase = "prep" | "battle" | "result";
