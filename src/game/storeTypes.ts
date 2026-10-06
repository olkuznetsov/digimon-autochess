import type { Fighter, PendingEvolution, Phase, Placement, Unit } from "./types";
import type { CombatEvent } from "./battle";
import type { LobbyFight, LobbySnapshot, Outcome, WireUnit } from "./lobby";
import type { Difficulty } from "./tuning";

/** The game store's shapes (the store itself: store.ts). */

/** A board unit as sent over the wire (VS boards, live scouting, ghost boards). */
export type PvpBoardUnit = WireUnit;

/** Live VS lobby / match state (null = solo). Rules: src/game/lobby.ts. */
export interface PvpState {
  code: string;
  seat: number;
  /** the room's secret for our seat: reclaims it after a dropped connection */
  pid: string;
  /** the room as the server last described it: stage, host, players, HP, pairings */
  snap: LobbySnapshot;
  /** everyone's latest arrangement (live scouting) */
  boards: Record<number, PvpBoardUnit[]>;
  /** whose board the preview shows (null = this round's opponent) */
  scout: number | null;
  myReady: boolean;
  /** board we last readied with — resent after a reconnect */
  lastReady: PvpBoardUnit[] | null;
  /** planning deadline (ms epoch); 0 = no timer running */
  prepEndsAt: number;
  /** our socket dropped; reconnecting */
  selfOffline: boolean;
  /** gave up reconnecting */
  connLost: boolean;
  /** the room runs other rules than this tab (an update went out): reload to play */
  outdated: boolean;
  /** the fight on screen and our outcome in it — known when it starts, since every
   *  client simulates every fight of the round the same way */
  fight: { round: number; opp: number | null; ghost: boolean; outcome: Outcome } | null;
  /** room updates that would spoil the ending of the fight on screen */
  pending: { snap: LobbySnapshot; eliminated: number[] } | null;
  /** knocked out, and chose to keep watching */
  watching: boolean;
  /** the round whose carousel item is already in our tray */
  carouselGot: number;
}

/** A live combat effect (damage number, projectile, death burst) with its spawn time. */
export interface Fx extends CombatEvent {
  id: string;
  born: number; // battleTime seconds
  jx: number; // small positional jitter so stacked numbers don't overlap
  jz: number;
  /** cast only: cast by the viewer's own side (after the PvP view flip) */
  mine?: boolean;
}
/** One of your units in a damage meter. */
export interface MeterRow {
  uid: string;
  formId: string;
  dead: boolean;
  dealt: number;
  taken: number;
}

export interface GameState {
  gold: number;
  level: number;
  xp: number;
  health: number;
  round: number;
  /** the solo run's seed: picks which boss each boss round brings (0 = the classic ones) */
  runSeed: number;
  /** the solo run's difficulty (chosen when it starts) */
  difficulty: Difficulty;
  /** the Primary Village mode: a Digimon that falls in battle hatches again, in the same
   *  fight, as its line's baby (once a fight) — off the leaderboard */
  village: boolean;
  streak: number;
  gameOver: boolean;

  shop: string[];
  /** Champions and Megas raised this game: the shop's tiers 4–5 offer only these */
  discovered: string[];
  /** the latest discoveries — the "now in your shop" toast */
  discoveryFlash: { ids: string[]; key: number } | null;
  units: Unit[];
  inventory: string[];
  selectedItem: string | null;
  inspected: string | null;
  /** the latest digivolution — banner text and the 3D sequence on that unit */
  evoFlash: { from: string; to: string; uid: string; key: number; star?: number } | null;
  pendingEvolution: PendingEvolution | null;
  phase: Phase;
  result: "win" | "lose" | null;
  lastDamage: number;

  fighters: Fighter[];
  /** fighters that died this battle — kept so the renderer can play their death */
  corpses: Fighter[];
  /** bumped whenever a fight starts, so every battle mounts fresh units and effects */
  battleSeq: number;
  /** damage dealt / taken per fighter uid this battle */
  meter: Record<string, { dealt: number; taken: number }>;
  /** the last battle's meter, for the prep view (null before the first battle) */
  lastMeter: MeterRow[] | null;
  fx: Fx[];
  battleTime: number;
  tick: number;
  /** battle playback speed multiplier (1 = normal; solo/ghost only — VS stays at 1) */
  simSpeed: number;
  /** keep the current shop through the next round */
  shopLocked: boolean;
  /** rewards of the round that just ended (result screen) */
  loot: { gold: number; items: string[] } | null;
  /** VS augments picked this match (src/game/augments.ts) */
  augments: string[];
  /** an augment round's three options (null = no pick open) */
  augmentOffer: string[] | null;
  /** rerolls left for the open augment offer */
  augmentRerolls: number;
  /** free shop rerolls left this round (Lucky Roll) */
  freeRerolls: number;
  boardSnapshot: Unit[] | null;

  dragId: string | null;
  dragPos: { x: number; z: number } | null;

  pvp: PvpState | null;
  /** render the battle mirrored (PvP guest: the canonical sim has host at the bottom) */
  viewFlip: boolean;
  /** ghost battle vs a leaderboard player's saved board (no run consequences) */
  ghost: { name: string; partner?: string | null } | null;

  reroll: () => void;
  buy: (shopIndex: number) => void;
  buyXp: () => void;
  chooseEvolution: (formId: string) => void;
  selectItem: (id: string | null) => void;
  /** fuse inventory items at indices a and b (a recipe must exist) */
  fuseItems: (a: number, b: number) => void;
  equipItem: (uid: string) => void;
  setInspected: (uid: string | null) => void;
  clearEvoFlash: () => void;
  sellUnit: (uid: string) => void;
  moveUnit: (uid: string, target: Placement) => void;
  setDrag: (uid: string | null, pos: { x: number; z: number } | null) => void;
  startBattle: () => void;
  stepBattle: (dt: number) => void;
  toPrep: () => void;
  reset: () => void;
  toggleShopLock: () => void;
  setSimSpeed: (speed: number) => void;

  /** connected to a lobby (or back in it after a drop) */
  pvpJoined: (
    code: string,
    seat: number,
    pid: string,
    snap: LobbySnapshot,
    boards: Record<number, PvpBoardUnit[]>,
    lastFight?: LobbyFight,
  ) => void;
  /** the host started a match (or a new one) */
  pvpStarted: (snap: LobbySnapshot) => void;
  /** the room changed (players, HP, places, next pairings); `eliminated` = just knocked out */
  pvpSync: (snap: LobbySnapshot, eliminated: number[], lastFight?: LobbyFight) => void;
  pvpSeatReady: (seat: number, round: number) => void;
  pvpBoard: (seat: number, board: PvpBoardUnit[]) => void;
  /** everyone is locked in: simulate the round, report it, play our own fight */
  pvpFight: (fight: LobbyFight) => void;
  pvpReadyUp: (force?: boolean) => void;
  /** planning timer ran out: settle open choices and ready with the current board */
  pvpAutoReady: () => void;
  pvpStart: () => void;
  pvpSurrender: () => void;
  pvpScout: (seat: number | null) => void;
  pvpWatch: () => void;
  pvpSelfOffline: (offline: boolean) => void;
  pvpConnectionLost: () => void;
  /** the room turned us away: it runs other rules than this tab */
  pvpOutdated: () => void;
  /** back to the solo run that was paused for the match */
  pvpQuit: () => void;
  /** carousel: take the item at this index (when it's our turn) */
  pvpPick: (index: number) => void;
  pickAugment: (id: string) => void;
  rerollAugments: () => void;

  ghostFight: (board: PvpBoardUnit[], name: string, partner?: string | null) => void;
  ghostReturn: () => void;
}
