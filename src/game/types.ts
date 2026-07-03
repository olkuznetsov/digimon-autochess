// Core game types. Renderer-agnostic on purpose: when Colyseus takes over,
// this is roughly the schema the server would own.

export type Attribute = "Vaccine" | "Data" | "Virus";

export type Family =
  | "Dragon's Roar"
  | "Nature Spirits"
  | "Wind Guardians"
  | "Nightmare Soldiers"
  | "Deep Savers";

/** Combat archetype — drives stats via a (role, stage) table. */
export type Role = "tank" | "bruiser" | "assassin" | "ranged" | "caster";

/**
 * A single Digimon form (a node in the digivolution graph).
 * stage: 1 = Rookie, 2 = Champion, 3 = Ultimate.
 * Rookies have a `cost` (sold in the shop); higher stages are reached by evolving.
 * `evolvesTo` lists the next-stage branches — >1 means the player chooses.
 */
export interface Form {
  id: string;
  name: string;
  stage: 1 | 2 | 3;
  attribute: Attribute;
  family: Family;
  role: Role;
  cost?: number;
  evolvesTo?: string[];
}

/** A unit instance the player owns (on bench or board). */
export interface Unit {
  uid: string;
  formId: string;
  placement: Placement;
  /** equipped item ids (max 2), persist through digivolution */
  items: string[];
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
  /** equipped item ids (cosmetic reference) */
  items: string[];
}

export type Phase = "prep" | "battle" | "result";
