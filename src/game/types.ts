// Core game types. Kept renderer-agnostic on purpose: when Colyseus takes over,
// this is roughly the schema the server would own.

export type Attribute = "Vaccine" | "Data" | "Virus";

export type Family =
  | "Dragon's Roar"
  | "Nature Spirits"
  | "Wind Guardians"
  | "Nightmare Soldiers"
  | "Deep Savers";

/** A base creature definition (tier-1) plus its digivolution line. */
export interface CreatureDef {
  id: string;
  name: string;
  attribute: Attribute;
  family: Family;
  cost: number; // shop cost in gold
  /** Names of each star level: [1-star, 2-star, 3-star]. */
  line: [string, string, string];
  base: {
    hp: number;
    attack: number;
    /** attacks per second */
    attackSpeed: number;
    /** attack reach in board cells */
    range: number;
  };
}

/** A unit instance the player owns (on bench or board). */
export interface Unit {
  /** unique instance id */
  uid: string;
  defId: string;
  /** 1, 2 or 3 stars (digivolution level) */
  star: 1 | 2 | 3;
  /** "bench" slot index, or a board cell, depending on placement */
  placement: Placement;
}

export type Placement =
  | { kind: "bench"; slot: number }
  | { kind: "board"; col: number; row: number };

/** A combatant snapshot used only during the battle simulation. */
export interface Fighter {
  uid: string;
  defId: string;
  star: 1 | 2 | 3;
  team: "player" | "enemy";
  attribute: Attribute;
  hp: number;
  maxHp: number;
  attack: number;
  attackSpeed: number;
  range: number;
  /** live world-ish board coordinates (col, row as floats while moving) */
  col: number;
  row: number;
  /** seconds until this fighter can attack again */
  cooldown: number;
  /** true while walking toward a target (drives the "move" animation clip) */
  moving: boolean;
  targetUid: string | null;
}

export type Phase = "prep" | "battle" | "result";
