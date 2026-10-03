import { create } from "zustand";
import type { Fighter, PendingEvolution, Phase, Placement, Unit } from "./types";
import { FORMS, PLAYABLE_IDS, ROOKIE_IDS, costOf, mergeParts, sellValue } from "./creatures";
import { makeFighter, stepCombat, SIM_DT, type CombatEvent } from "./battle";
import { applySynergies } from "./synergies";
import { BASE_ITEM_IDS, DIGIVICE, FUSED_ITEM_IDS, RARE_ITEM_IDS, fuseResult } from "./items";
import { ECONOMY, SHOP_ODDS, VS, isBossRound, makeEnemyWave, vsRoundKind } from "./tuning";
import {
  carouselEnd,
  carouselPick,
  fullPool,
  opponentOf,
  type LobbyFight,
  type LobbySnapshot,
  type Outcome,
  type WireUnit,
} from "./lobby";
import { duelFighters, ghostFighters, outcomesHash, pveFighters, roundOutcomes, FIGHT_STEPS } from "./vsFights";
import { augmentOffer, isAugmentRound, MAX_AUGMENTS } from "./augments";
import { XP_TO_NEXT, MAX_LEVEL } from "./xpView";
import { sfx, battleSfx } from "../audio/sfx";
import { BENCH_SLOTS, COLS, ROWS } from "./board";
import { net } from "../net/bus";
import { submitScore } from "../net/leaderboard";

const SHOP_SIZE = 5;

const START_LEVEL = 2;
const START_HEALTH = 100;


let uidCounter = 0;
const nextUid = () => `u${uidCounter++}`;

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
let fxCounter = 0;
const FX_TTL = 1.0; // seconds an effect stays in the list

/**
 * Five offers for the shop: a tier — the stage, Fresh 1 … Mega 5 — by the player's
 * level, then a form of that tier. Fresh, In-Training and Rookies are always on offer;
 * a Champion or Mega only once raised this game (`discovered`). In a VS lobby the
 * shared pool weighs the draw — every copy left is a ticket, and a form that has run
 * out can't show up (a tier with nothing on offer is skipped).
 */
function rollShop(level: number, discovered: string[], pool?: Record<string, number>): string[] {
  const odds = SHOP_ODDS[Math.max(1, Math.min(MAX_LEVEL, level))];
  const left = (id: string) => (pool ? (pool[id] ?? 0) : 1);
  const open = new Set(discovered);
  const inTier = (tier: number) =>
    PLAYABLE_IDS.filter((id) => FORMS[id].stage === tier && (tier <= 3 || open.has(id)) && left(id) > 0);
  const weights = odds.map((w, t) => (inTier(t + 1).length > 0 ? w : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  return Array.from({ length: SHOP_SIZE }, () => {
    if (total === 0) return "";
    let r = Math.random() * total;
    let tier = 1;
    for (let t = 0; t < weights.length; t++) {
      r -= weights[t];
      if (r < 0) {
        tier = t + 1;
        break;
      }
    }
    const cands = inTier(tier);
    let x = Math.random() * cands.reduce((a, id) => a + left(id), 0);
    for (const id of cands) {
      x -= left(id);
      if (x < 0) return id;
    }
    return cands[cands.length - 1];
  });
}

/** Champions and Megas the player now has join the discovered list: from now on they
 *  can show up in the shop (Fresh, In-Training and Rookies always can). */
function discover(discovered: string[], units: Unit[]): string[] {
  const add = [...new Set(units.map((u) => u.formId))].filter((id) => FORMS[id].stage >= 4 && !discovered.includes(id));
  return add.length ? [...discovered, ...add] : discovered;
}

/** discover() plus the toast for whatever is new (spread into a store update). */
function discovery(prev: string[], units: Unit[]) {
  const next = discover(prev, units);
  return next === prev ? {} : { discovered: next, discoveryFlash: { ids: next.slice(prev.length), key: Date.now() } };
}

/** The shared pool shops roll from — only during a VS match. */
const shopPool = (s: { pvp: PvpState | null }) => (s.pvp?.snap.stage === "match" ? s.pvp.snap.pool : undefined);

function gainXp(level: number, xp: number, amount: number): { level: number; xp: number } {
  let L = level;
  let X = xp + amount;
  while (L < MAX_LEVEL && X >= (XP_TO_NEXT[L] ?? Infinity)) {
    X -= XP_TO_NEXT[L];
    L++;
  }
  if (L >= MAX_LEVEL) X = 0;
  return { level: L, xp: X };
}

const interest = (gold: number, cap = 5) => Math.min(Math.floor(gold / 10), cap);
const streakBonus = (streak: number) => {
  const a = Math.abs(streak);
  return a >= 4 ? 3 : a >= 3 ? 2 : a >= 2 ? 1 : 0;
};

/**
 * Resolve digivolutions after a unit changes. Auto-evolves any 3-of-a-kind whose
 * form has a single branch (looping), and stops at the first 3-of-a-kind that has
 * multiple branches — returning a PendingEvolution for the player to choose.
 * Items of the merged copies carry over: two on the evolved unit, the rest come
 * back in `spill` (for the item tray).
 */
function resolveEvolutions(units: Unit[]): {
  units: Unit[];
  pending: PendingEvolution | null;
  evolved: { from: string; to: string; uid: string }[];
  spill: string[];
} {
  let current = units;
  const evolved: { from: string; to: string; uid: string }[] = [];
  const spill: string[] = [];
  // guard against pathological loops
  for (let guard = 0; guard < 64; guard++) {
    const groups = new Map<string, Unit[]>();
    for (const u of current) {
      const form = FORMS[u.formId];
      if (!form.evolvesTo || form.evolvesTo.length === 0) continue;
      const arr = groups.get(u.formId) ?? [];
      arr.push(u);
      groups.set(u.formId, arr);
    }

    let acted = false;
    for (const [formId, arr] of groups) {
      if (arr.length < 3) continue;
      const form = FORMS[formId];
      const onBoard = arr.find((u) => u.placement.kind === "board");
      const keep = onBoard ?? arr[0];
      const others = arr.filter((u) => u.uid !== keep.uid).slice(0, 2);

      if (form.evolvesTo!.length === 1) {
        const consumed = new Set(others.map((u) => u.uid));
        const items = [...(keep.items ?? []), ...others.flatMap((u) => u.items ?? [])];
        spill.push(...items.slice(2));
        const parts = mergeParts([keep, ...others]);
        current = current
          .filter((u) => !consumed.has(u.uid))
          .map((u) => (u.uid === keep.uid ? { ...u, formId: form.evolvesTo![0], items: items.slice(0, 2), parts } : u));
        evolved.push({ from: formId, to: form.evolvesTo![0], uid: keep.uid });
        acted = true;
        break; // re-scan from the top
      }

      // multiple branches → ask the player
      return {
        units: current,
        pending: {
          fromFormId: formId,
          consume: [keep.uid, ...others.map((u) => u.uid)],
          options: form.evolvesTo!,
          placement: keep.placement,
        },
        evolved,
        spill,
      };
    }
    if (!acted) break;
  }
  return { units: current, pending: null, evolved, spill };
}

interface GameState {
  gold: number;
  level: number;
  xp: number;
  health: number;
  round: number;
  /** the solo run's seed: picks which boss each boss round brings (0 = the classic ones) */
  runSeed: number;
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
  evoFlash: { from: string; to: string; uid: string; key: number } | null;
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
  ghost: { name: string } | null;

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

  ghostFight: (board: PvpBoardUnit[], name: string) => void;
  ghostReturn: () => void;
}

const touchDevice = () => typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
/** When the VS planning phase that starts now runs out. */
const planDeadline = () => Date.now() + (touchDevice() ? VS.planSecondsTouch : VS.planSeconds) * 1000;

const randomOf = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const FUSED_IDS = FUSED_ITEM_IDS;
const CHAMPION_IDS = PLAYABLE_IDS.filter((id) => FORMS[id].stage === 4);
/** after the carousel, at least this long to equip the new item */
const AFTER_CAROUSEL_MS = 20_000;

/** What a VS round pays: wild rounds drop a base item, bosses a fused one, a loss
 *  still pays 1; a fight with a player pays the win gold and moves the streak. */
function vsRewards(round: number, o: Outcome, streak: number) {
  const kind = vsRoundKind(round);
  const pve = kind !== "pvp";
  return {
    // a boss also leaves something rare: Digitama or a relic
    items: pve && o.won ? (kind === "boss" ? [randomOf(FUSED_IDS), randomOf(RARE_ITEM_IDS)] : [randomOf(BASE_ITEM_IDS)]) : [],
    gold: pve ? (o.won ? (kind === "boss" ? 4 : 2) : 1) : o.won ? ECONOMY.winGold : 0,
    streak: pve ? streak : o.won ? Math.max(1, streak + 1) : Math.min(-1, streak - 1),
  };
}

/** Our seat in the room (HP, alive, place). */
export const pvpMe = (pvp: PvpState | null) => pvp?.snap.seats.find((s) => s.seat === pvp.seat) ?? null;
export const pvpName = (pvp: PvpState | null, seat: number | null | undefined) =>
  pvp?.snap.seats.find((s) => s.seat === seat)?.name ?? "?";

/** Run state for a fresh VS match — both players start equal. */
function freshMatchRun() {
  return {
    gold: ECONOMY.startGold,
    level: START_LEVEL,
    xp: 0,
    health: START_HEALTH,
    round: 1,
    streak: 0,
    gameOver: false,
    units: [] as Unit[],
    inventory: [] as string[],
    discovered: [] as string[],
    discoveryFlash: null,
    shop: rollShop(START_LEVEL, [], fullPool()),
    shopLocked: false,
    phase: "prep" as Phase,
    result: null,
    fighters: [] as Fighter[],
    corpses: [] as Fighter[],
    fx: [] as Fx[],
    pendingEvolution: null,
    inspected: null,
    loot: null,
    augments: [] as string[],
    augmentOffer: null,
    augmentRerolls: 0,
    freeRerolls: 0,
  };
}

function readSpeed(): number {
  try {
    return localStorage.getItem("dac-speed") === "2" ? 2 : 1;
  } catch {
    return 1;
  }
}

const newRunSeed = () => 1 + Math.floor(Math.random() * (2 ** 31 - 2));

function initialState() {
  return {
    gold: ECONOMY.startGold,
    level: START_LEVEL,
    xp: 0,
    health: START_HEALTH,
    round: 1,
    runSeed: newRunSeed(),
    streak: 0,
    gameOver: false,
    shop: rollShop(START_LEVEL, []),
    discovered: [] as string[],
    discoveryFlash: null as { ids: string[]; key: number } | null,
    units: [] as Unit[],
    inventory: [] as string[],
    selectedItem: null as string | null,
    inspected: null as string | null,
    evoFlash: null as { from: string; to: string; uid: string; key: number } | null,
    pendingEvolution: null as PendingEvolution | null,
    phase: "prep" as Phase,
    result: null as "win" | "lose" | null,
    lastDamage: 0,
    fighters: [] as Fighter[],
    corpses: [] as Fighter[],
    battleSeq: 0,
    meter: {} as Record<string, { dealt: number; taken: number }>,
    fx: [] as Fx[],
    battleTime: 0,
    tick: 0,
    simSpeed: readSpeed(),
    shopLocked: false,
    loot: null as { gold: number; items: string[] } | null,
    augments: [] as string[],
    augmentOffer: null as string[] | null,
    augmentRerolls: 0,
    freeRerolls: 0,
    boardSnapshot: null as Unit[] | null,
    dragId: null as string | null,
    dragPos: null as { x: number; z: number } | null,
    pvp: null as PvpState | null,
    viewFlip: false,
    ghost: null as { name: string } | null,
  };
}

function firstEmptyBench(units: Unit[]): number | null {
  const used = new Set(
    units.filter((u) => u.placement.kind === "bench").map((u) => (u.placement as { slot: number }).slot),
  );
  for (let i = 0; i < BENCH_SLOTS; i++) if (!used.has(i)) return i;
  return null;
}

const boardCount = (units: Unit[]) => units.filter((u) => u.placement.kind === "board").length;
/** How many Digimon may fight: the level, plus one per Digivice on a fielded unit. */
export const boardCap = (units: Unit[], level: number) =>
  level + units.filter((u) => u.placement.kind === "board").reduce((n, u) => n + (u.items ?? []).filter((i) => i === DIGIVICE).length, 0);

/** A wire board unit as a Unit (for applySynergies, which only counts forms). */
const wireToUnit = (uid: string, u: PvpBoardUnit): Unit => ({
  uid,
  formId: u.formId,
  placement: { kind: "board", col: u.col, row: u.row },
  items: u.items ?? [],
});

/** Mirror a board cell to the other half (row 0 <-> row 5, col 0 <-> col 5). */
const mirrorCol = (c: number) => COLS - 1 - c;
const mirrorRow = (r: number) => ROWS - 1 - r;

/** Serialize on-board units (VS boards, live scouting, leaderboard ghost boards). */
export function wireBoard(units: Unit[]): PvpBoardUnit[] {
  return units
    .filter((u) => u.placement.kind === "board")
    .map((u) => {
      const p = u.placement as { col: number; row: number };
      return { uid: u.uid, formId: u.formId, col: p.col, row: p.row, items: u.items ?? [] };
    });
}

export const useGame = create<GameState>((set, get) => ({
  ...initialState(),

  reroll: () => {
    const { gold, freeRerolls } = get();
    if (freeRerolls <= 0 && gold < ECONOMY.rerollCost) return;
    sfx.reroll();
    set({
      ...(freeRerolls > 0 ? { freeRerolls: freeRerolls - 1 } : { gold: gold - ECONOMY.rerollCost }),
      shop: rollShop(get().level, get().discovered, shopPool(get())),
    });
  },

  buy: (shopIndex) => {
    const { gold, shop, units, pendingEvolution, inventory } = get();
    if (pendingEvolution) return;
    const formId = shop[shopIndex];
    if (!formId) return;
    const cost = costOf(formId);
    if (gold < cost) return;
    const slot = firstEmptyBench(units);
    // a full bench still allows buying the 3rd copy of something you own twice —
    // the digivolve merge consumes the copies, so space frees up immediately
    const copies = units.filter((u) => u.formId === formId).length;
    if (slot === null && copies < 2) return; // bench truly full
    const placement: Placement =
      slot !== null ? { kind: "bench", slot } : { kind: "bench", slot: 98 }; // temp; consumed by the merge
    const newUnit: Unit = { uid: nextUid(), formId, placement, items: [] };
    const newShop = [...shop];
    newShop[shopIndex] = "";
    const resolved = resolveEvolutions([...units, newUnit]);
    sfx.buy();
    const last = resolved.evolved[resolved.evolved.length - 1];
    if (last) sfx.evolve();
    set({
      gold: gold - cost,
      shop: newShop,
      units: resolved.units,
      ...discovery(get().discovered, resolved.units),
      pendingEvolution: resolved.pending,
      ...(resolved.spill.length ? { inventory: [...inventory, ...resolved.spill] } : {}),
      ...(last ? { evoFlash: { ...last, key: Date.now() } } : {}),
    });
  },

  buyXp: () => {
    const { gold, level, xp } = get();
    if (level >= MAX_LEVEL || gold < ECONOMY.xpCost) return;
    sfx.click();
    set({ gold: gold - ECONOMY.xpCost, ...gainXp(level, xp, ECONOMY.xpPerBuy) });
  },

  chooseEvolution: (formId) => {
    const { pendingEvolution, units, inventory } = get();
    if (!pendingEvolution || !pendingEvolution.options.includes(formId)) return;
    const consumed = new Set(pendingEvolution.consume);
    const pooled = units.filter((u) => consumed.has(u.uid)).flatMap((u) => u.items ?? []);
    const remaining = units.filter((u) => !consumed.has(u.uid));
    const evolvedUid = nextUid();
    const parts = mergeParts(units.filter((u) => consumed.has(u.uid)));
    remaining.push({ uid: evolvedUid, formId, placement: pendingEvolution.placement, items: pooled.slice(0, 2), parts });
    const resolved = resolveEvolutions(remaining);
    sfx.evolve();
    const last = resolved.evolved[resolved.evolved.length - 1];
    const flash = last ?? { from: pendingEvolution.fromFormId, to: formId, uid: evolvedUid };
    set({
      units: resolved.units,
      ...discovery(get().discovered, resolved.units),
      pendingEvolution: resolved.pending,
      inventory: [...inventory, ...pooled.slice(2), ...resolved.spill],
      evoFlash: { ...flash, key: Date.now() },
    });
  },

  selectItem: (id) => set({ selectedItem: id }),

  fuseItems: (a, b) => {
    const { inventory } = get();
    if (a === b || !inventory[a] || !inventory[b]) return;
    const result = fuseResult(inventory[a], inventory[b]);
    if (!result) return;
    sfx.evolve();
    set({
      inventory: [...inventory.filter((_, i) => i !== a && i !== b), result],
      selectedItem: null,
    });
  },

  setInspected: (uid) => set({ inspected: uid }),

  clearEvoFlash: () => set({ evoFlash: null }),

  sellUnit: (uid) => {
    const { units, gold, inventory, phase } = get();
    if (phase !== "prep") return;
    const u = units.find((x) => x.uid === uid);
    if (!u) return;
    sfx.sell();
    set({
      units: units.filter((x) => x.uid !== uid),
      gold: gold + sellValue(u),
      inventory: [...inventory, ...(u.items ?? [])],
      inspected: null,
    });
  },

  equipItem: (uid) => {
    const { selectedItem, inventory, units } = get();
    if (!selectedItem) return;
    const unit = units.find((u) => u.uid === uid);
    if (!unit) return;
    const held = unit.items ?? [];
    // a base item onto a Digimon holding a base item fuses on the spot (TFT-style)
    const partner = held.findIndex((it) => fuseResult(it, selectedItem) !== null);
    if (partner < 0 && held.length >= 2) return;
    const idx = inventory.indexOf(selectedItem);
    if (idx < 0) return;
    const nextInv = [...inventory];
    nextInv.splice(idx, 1);
    const items =
      partner >= 0 ? held.map((it, i) => (i === partner ? fuseResult(it, selectedItem)! : it)) : [...held, selectedItem];
    if (partner >= 0) sfx.evolve();
    else sfx.equip();
    set({
      units: units.map((u) => (u.uid === uid ? { ...u, items } : u)),
      inventory: nextInv,
      selectedItem: null,
    });
  },

  moveUnit: (uid, target) => {
    const { units, level } = get();
    const moving = units.find((u) => u.uid === uid);
    if (!moving) return;

    const occupant = units.find(
      (u) =>
        u.uid !== uid &&
        u.placement.kind === target.kind &&
        ((target.kind === "bench" &&
          (u.placement as { slot: number }).slot === (target as { slot: number }).slot) ||
          (target.kind === "board" &&
            (u.placement as { col: number; row: number }).col === (target as { col: number; row: number }).col &&
            (u.placement as { col: number; row: number }).row === (target as { col: number; row: number }).row)),
    );

    if (target.kind === "board" && moving.placement.kind === "bench" && !occupant && boardCount(units) >= boardCap(units, level)) {
      return;
    }

    const from = moving.placement;
    const next = units.map((u) => {
      if (u.uid === uid) return { ...u, placement: target };
      if (occupant && u.uid === occupant.uid) return { ...u, placement: from };
      return u;
    });
    set({ units: next });
  },

  setDrag: (uid, pos) => set({ dragId: uid, dragPos: pos }),

  startBattle: () => {
    const { units, round, runSeed, pendingEvolution } = get();
    if (pendingEvolution) return;
    const onBoard = units.filter((u) => u.placement.kind === "board");
    if (onBoard.length === 0) return;

    const playerFighters: Fighter[] = onBoard.map((u) => {
      const p = u.placement as { col: number; row: number };
      return makeFighter(u.formId, u.uid, "player", p.col, p.row, 1, u.items ?? []);
    });

    applySynergies(playerFighters, onBoard);
    if (isBossRound(round)) sfx.bossIntro();
    else sfx.battleStart();

    set({
      phase: "battle",
      battleSeq: get().battleSeq + 1,
      meter: {},
      result: null,
      viewFlip: false,
      boardSnapshot: units,
      fighters: [...playerFighters, ...makeEnemyWave(round, runSeed)],
      corpses: [],
      fx: [],
      battleTime: 0,
      tick: 0,
    });
  },

  stepBattle: (dt) => {
    const state = get();
    if (state.phase !== "battle") return;
    const fighters = state.fighters;

    const events: CombatEvent[] = [];
    stepCombat(fighters, dt, events);
    if (!silent) for (const e of events) battleSfx(e);
    let meter = state.meter;
    for (const e of events) {
      if (e.kind !== "hit" || !e.src || !e.tgt || !e.amount) continue;
      if (meter === state.meter) meter = { ...meter };
      const a = (meter[e.src] = { ...(meter[e.src] ?? { dealt: 0, taken: 0 }) });
      a.dealt += e.amount;
      const b = (meter[e.tgt] = { ...(meter[e.tgt] ?? { dealt: 0, taken: 0 }) });
      b.taken += e.amount;
    }
    const bt = state.battleTime + dt;

    // effects list: prune old, append this step's events (incl. the final blow —
    // it used to be dropped because the end-of-battle branches reset fx to [])
    let fx = state.fx;
    const pruned = fx.filter((f) => bt - f.born < FX_TTL);
    if (events.length > 0 || pruned.length !== fx.length) {
      fx = [
        ...pruned,
        ...events.map((e) => ({
          ...e,
          ...(state.viewFlip
            ? {
                col: mirrorCol(e.col),
                row: mirrorRow(e.row),
                fromCol: e.fromCol == null ? undefined : mirrorCol(e.fromCol),
                fromRow: e.fromRow == null ? undefined : mirrorRow(e.fromRow),
                toCol: e.toCol == null ? undefined : mirrorCol(e.toCol),
                toRow: e.toRow == null ? undefined : mirrorRow(e.toRow),
              }
            : {}),
          mine: e.team ? (e.team === "player") !== state.viewFlip : undefined,
          id: `fx${fxCounter++}`,
          born: bt,
          jx: (Math.random() - 0.5) * 0.35,
          jz: (Math.random() - 0.5) * 0.2,
        })),
      ];
    }

    const alive = fighters.filter((fr) => fr.hp > 0);
    const corpses =
      alive.length === fighters.length ? state.corpses : [...state.corpses, ...fighters.filter((fr) => fr.hp <= 0)];
    const playersLeft = alive.some((fr) => fr.team === "player");
    const enemiesLeft = alive.some((fr) => fr.team === "enemy");
    // a VS fight still undecided after FIGHT_STEPS is a draw, as in everyone's simulation
    const stalemate = !!state.pvp?.fight && state.tick + 1 >= FIGHT_STEPS;

    if (!playersLeft || !enemiesLeft || stalemate) {
      const win = playersLeft;
      if (state.ghost) {
        // ghost scrim: show the result, change nothing about the run
        if (win) sfx.win();
        else sfx.lose();
        set({
          phase: "result",
          result: win ? "win" : "lose",
          fighters: alive,
          corpses,
          fx,
          meter,
          battleTime: bt,
          tick: state.tick + 1,
        });
        return;
      }
      if (state.pvp?.fight) {
        // VS: the outcome was settled when the fight started (every client simulates
        // every fight of the round); the fight on screen plays it out
        const o = state.pvp.fight.outcome;
        const { items, gold: lootGold, streak } = vsRewards(state.round, o, state.streak);
        if (!silent) {
          if (o.won) sfx.win();
          else sfx.lose();
          if (items.length) sfx.drop();
        }
        const pending = state.pvp.pending;
        set({
          phase: "result",
          result: o.won ? "win" : "lose",
          fighters: alive,
          corpses,
          fx,
          meter,
          battleTime: bt,
          tick: state.tick + 1,
          health: Math.max(0, state.health - o.damage),
          lastDamage: o.damage,
          streak,
          gold: state.gold + lootGold,
          inventory: [...state.inventory, ...items].slice(0, 10),
          loot: lootGold || items.length ? { gold: lootGold, items } : null,
          pvp: { ...state.pvp, pending: null },
        });
        // the room's standings for this round were held back until now
        if (pending) get().pvpSync(pending.snap, pending.eliminated);
        return;
      }
      const survivingEnemies = alive.filter((fr) => fr.team === "enemy").length;
      const damage = win ? 0 : 4 + survivingEnemies * 2;
      const health = Math.max(0, state.health - damage);
      const streak = win
        ? state.streak >= 0
          ? state.streak + 1
          : 1
        : state.streak <= 0
          ? state.streak - 1
          : -1;
      const bossBonus = win && isBossRound(state.round);
      const dropped =
        win && state.inventory.length < 8 && (bossBonus || Math.random() < 0.55)
          ? [...state.inventory, BASE_ITEM_IDS[Math.floor(Math.random() * BASE_ITEM_IDS.length)]]
          : state.inventory;
      // bosses also leave something rare: Digitama (Digimentals, Digivice) or a relic
      const inventory = bossBonus && dropped.length < 9 ? [...dropped, randomOf(RARE_ITEM_IDS)] : dropped;
      if (win) sfx.win();
      else sfx.lose();
      if (inventory.length > state.inventory.length) sfx.drop();
      if (health <= 0) {
        try {
          const best = Number(localStorage.getItem("dac-best-round") ?? 0);
          if (state.round > best) localStorage.setItem("dac-best-round", String(state.round));
          localStorage.removeItem(SAVE_KEY);
        } catch { /* ignore */ }
        submitScore({ best: state.round, board: wireBoard(state.boardSnapshot ?? state.units) });
      } else if (win && state.round >= 15) {
        // run complete (and endless milestones) — post the winning board
        submitScore({ best: state.round, board: wireBoard(state.boardSnapshot ?? state.units) });
      }
      set({
        phase: "result",
        result: win ? "win" : "lose",
        fighters: alive,
        corpses,
        fx,
        meter,
        battleTime: bt,
        streak,
        inventory,
        gold: state.gold + (bossBonus ? 3 : 0) + (win ? ECONOMY.winGold : 0),
        health,
        lastDamage: damage,
        gameOver: health <= 0,
        tick: state.tick + 1,
      });
    } else {
      set({ fighters: alive, corpses, fx, meter, battleTime: bt, tick: state.tick + 1 });
    }
  },

  toPrep: () => {
    const state = get();
    if (state.gameOver) return;
    const has = (id: string) => state.augments.includes(id);
    const income =
      ECONOMY.baseIncome +
      interest(state.gold, has("compound") ? 8 : 5) +
      streakBonus(state.streak) +
      (has("dividend") ? 2 : 0);
    const leveled = gainXp(state.level, state.xp, ECONOMY.passiveXp + (has("fastlearner") ? 2 : 0));
    // augment rounds open with a pick (VS, still standing)
    const augmentRound =
      state.pvp?.snap.stage === "match" &&
      !!pvpMe(state.pvp)?.alive &&
      isAugmentRound(state.round + 1) &&
      state.augments.length < MAX_AUGMENTS;
    set({
      phase: "prep",
      result: null,
      fighters: [],
      corpses: [],
      fx: [],
      boardSnapshot: null,
      units: state.boardSnapshot ?? state.units,
      gold: state.gold + income,
      round: state.round + 1,
      level: leveled.level,
      xp: leveled.xp,
      shop: state.shopLocked ? state.shop : rollShop(leveled.level, state.discovered, shopPool(state)),
      viewFlip: false,
      loot: null,
      freeRerolls: has("freeroll") ? 1 : 0,
      ...(augmentRound ? { augmentOffer: augmentOffer(state.augments), augmentRerolls: 1 } : {}),
      ...(state.pvp ? { pvp: { ...state.pvp, myReady: false, prepEndsAt: planDeadline(), fight: null, scout: null } } : {}),
    });
    // planning the next round: the room opens the carousel once everyone is here
    if (state.pvp?.snap.stage === "match") net.send?.({ t: "arrived", round: state.round + 1 });
  },

  reset: () => {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    set({ ...initialState() });
  },

  toggleShopLock: () => {
    sfx.click();
    set({ shopLocked: !get().shopLocked });
  },

  setSimSpeed: (speed) => {
    try {
      localStorage.setItem("dac-speed", String(speed));
    } catch { /* ignore */ }
    set({ simSpeed: speed });
  },

  // ---------- VS lobby: 2–8 players (rules: src/game/lobby.ts, network: src/net/lobby.ts) ----------
  pvpJoined: (code, seat, pid, snap, boards, lastFight) => {
    const { pvp } = get();
    if (pvp && pvp.code === code) {
      // back after a dropped connection: keep the run and catch up with the room
      set({ pvp: { ...pvp, seat, pid, boards: { ...pvp.boards, ...boards }, selfOffline: false, connLost: false } });
      get().pvpSync(snap, [], lastFight);
      return;
    }
    // a new lobby: the solo run waits behind the lobby screen until the match starts
    set({
      pvp: {
        code,
        seat,
        pid,
        snap,
        boards,
        scout: null,
        myReady: false,
        lastReady: null,
        prepEndsAt: 0,
        selfOffline: false,
        connLost: false,
        outdated: false,
        fight: null,
        pending: null,
        watching: false,
        carouselGot: 0,
      },
    });
  },

  pvpStarted: (snap) => {
    const { pvp, battleSeq } = get();
    if (!pvp) return;
    sfx.battleStart();
    set({
      ...freshMatchRun(),
      lastDamage: 0,
      viewFlip: false,
      ghost: null,
      boardSnapshot: null,
      battleSeq: battleSeq + 1,
      pvp: {
        ...pvp,
        snap,
        boards: {},
        scout: null,
        myReady: false,
        lastReady: null,
        prepEndsAt: planDeadline(),
        fight: null,
        pending: null,
        watching: false,
        carouselGot: 0,
      },
    });
  },

  pvpSync: (snap, eliminated, lastFight) => {
    const state = get();
    const pvp = state.pvp;
    if (!pvp) return;
    if (snap.stage !== "lobby" && snap.match !== pvp.snap.match) {
      // a new match started while we were away
      get().pvpStarted(snap);
      catchUp(snap, lastFight);
      return;
    }
    // the fight on screen hasn't ended yet: these standings would spoil it
    if (state.phase === "battle" && pvp.fight && snap.round > pvp.fight.round) {
      set({ pvp: { ...pvp, pending: { snap, eliminated: [...(pvp.pending?.eliminated ?? []), ...eliminated] } } });
      return;
    }
    const me = snap.seats.find((s) => s.seat === pvp.seat);
    if (eliminated.includes(pvp.seat)) sfx.lose();
    else if (eliminated.length > 0) sfx.drop();
    if (snap.stage === "over" && pvp.snap.stage !== "over" && me?.placement === 1) sfx.win();
    set({ pvp: { ...pvp, snap }, ...(me?.inMatch ? { health: me.hp } : {}) });
    if (snap.stage === "match" && me?.inMatch && me.alive) catchUp(snap, lastFight);
    collectCarousel(snap);
  },

  pvpSeatReady: (seat, round) => {
    const { pvp } = get();
    if (!pvp) return;
    const mark = (snap: LobbySnapshot) =>
      snap.round === round ? { ...snap, seats: snap.seats.map((s) => (s.seat === seat ? { ...s, ready: true } : s)) } : snap;
    set({ pvp: { ...pvp, snap: mark(pvp.snap), pending: pvp.pending && { ...pvp.pending, snap: mark(pvp.pending.snap) } } });
  },

  pvpBoard: (seat, board) => {
    const { pvp } = get();
    if (pvp) set({ pvp: { ...pvp, boards: { ...pvp.boards, [seat]: board } } });
  },

  pvpFight: (fight) => {
    const pvp0 = get().pvp;
    if (!pvp0 || fight.match !== pvp0.snap.match) return;
    // still on an earlier round (watching it or on its result screen): catch up first
    for (let guard = 0; get().round < fight.round && guard < 60; guard++) {
      if (get().phase === "battle") finishBattleNow();
      get().toPrep();
    }
    const state = get();
    const pvp = state.pvp!;
    if (state.round !== fight.round || (state.phase === "battle" && pvp.fight?.round === fight.round)) return;

    // every fight of the round, simulated here exactly as on every other client
    const seats = Object.keys(fight.boards).map(Number);
    const augs = fight.augments ?? {};
    const outcomes = roundOutcomes(fight.round, fight.plan, fight.boards, seats, augs, fight.variant ?? 0);
    net.send?.({ t: "report", match: fight.match, round: fight.round, results: outcomes, hash: outcomesHash(outcomes) });

    const boards = { ...pvp.boards, ...fight.boards };
    const kind = vsRoundKind(fight.round);
    const opp = kind === "pvp" ? opponentOf(fight.plan, pvp.seat) : null;
    const mine = outcomes.find((o) => o.seat === pvp.seat);
    const myBoard = fight.boards[pvp.seat];
    if (!mine || !myBoard || (kind === "pvp" && !opp)) {
      set({ pvp: { ...pvp, boards } }); // knocked out: just keeping score
      return;
    }
    // an augment still unpicked when the fight starts (the room started it without us)
    if (get().augmentOffer) get().pickAugment(get().augmentOffer![0]);
    const oppBoard = opp ? (fight.boards[opp.seat] ?? []) : [];
    const fighters = !opp
      ? pveFighters(myBoard, fight.round, pvp.seat, augs[pvp.seat], fight.variant ?? 0)
      : opp.ghost
        ? ghostFighters(fight.round, pvp.seat, myBoard, opp.seat, oppBoard, augs)
        : opp.home
          ? duelFighters(fight.round, pvp.seat, myBoard, opp.seat, oppBoard, augs)
          : duelFighters(fight.round, opp.seat, oppBoard, pvp.seat, myBoard, augs);
    if (kind === "boss") sfx.bossIntro();
    else sfx.battleStart();
    set({
      phase: "battle",
      battleSeq: get().battleSeq + 1,
      meter: {},
      result: null,
      loot: null,
      boardSnapshot: get().units,
      fighters,
      // the away player sees the canonical fight mirrored, their own units at the bottom
      viewFlip: !!opp && !opp.ghost && !opp.home,
      corpses: [],
      fx: [],
      battleTime: 0,
      tick: 0,
      pvp: {
        ...get().pvp!,
        boards,
        myReady: true,
        fight: { round: fight.round, opp: opp?.seat ?? null, ghost: !!opp?.ghost, outcome: mine },
        pending: null,
      },
    });
  },

  pvpPick: (index) => {
    const { pvp } = get();
    const c = pvp?.snap.carousel;
    if (!pvp || !c || c.done || c.taken[index] !== undefined || carouselPick(c, pvp.seat)) return;
    net.send?.({ t: "pick", index });
    sfx.click();
  },

  pickAugment: (id) => {
    const s = get();
    if (!s.augmentOffer?.includes(id)) return;
    sfx.evolve();
    // instant augments pay out now; economy and combat ones work from the augment list
    let { gold, inventory } = s;
    if (id === "treasure") gold += 10;
    if (id === "itemcache") inventory = [...inventory, randomOf(BASE_ITEM_IDS), randomOf(BASE_ITEM_IDS)];
    if (id === "fusionlab") inventory = [...inventory, randomOf(FUSED_IDS)];
    set({ gold, inventory, augments: [...s.augments, id], augmentOffer: null, augmentRerolls: 0 });
    if (id === "championegg") grantUnits([randomOf(CHAMPION_IDS)]);
    if (id === "rookierush") {
      const pool = shopPool(get());
      const left = ROOKIE_IDS.filter((r) => !pool || (pool[r] ?? 0) > 0);
      grantUnits([0, 1, 2].map(() => randomOf(left.length ? left : ROOKIE_IDS)));
    }
    if (s.pvp) net.send?.({ t: "augment", id });
  },

  rerollAugments: () => {
    const s = get();
    if (!s.augmentOffer || s.augmentRerolls <= 0) return;
    sfx.reroll();
    set({ augmentOffer: augmentOffer(s.augments, s.augmentOffer), augmentRerolls: s.augmentRerolls - 1 });
  },

  pvpReadyUp: (force = false) => {
    const { pvp, units, round, pendingEvolution } = get();
    if (!pvp || pvp.myReady || pvp.snap.stage !== "match" || !pvpMe(pvp)?.alive) return;
    // the carousel comes first: pick before locking in
    const c = pvp.snap.carousel;
    const drafting = !!c && c.round === round && !c.done && !carouselPick(c, pvp.seat);
    if ((pendingEvolution || drafting || get().augmentOffer) && !force) return;
    const board = wireBoard(units);
    // an empty board can only go in when the planning timer forces it
    if (board.length === 0 && !force) return;
    net.send?.({ t: "ready", round, board });
    sfx.click();
    set({ pvp: { ...pvp, myReady: true, lastReady: board } });
  },

  pvpAutoReady: () => {
    const s = get();
    if (!s.pvp || s.pvp.myReady || s.phase !== "prep") return;
    for (let i = 0; i < 4 && get().pendingEvolution; i++) get().chooseEvolution(get().pendingEvolution!.options[0]);
    if (get().augmentOffer) get().pickAugment(get().augmentOffer![0]);
    // an unpicked carousel item is handed out by the room when the draft closes
    get().pvpReadyUp(true);
  },

  pvpStart: () => {
    net.send?.({ t: "start" });
    sfx.click();
  },

  pvpSurrender: () => {
    const { pvp } = get();
    if (!pvp || pvp.snap.stage !== "match" || !pvpMe(pvp)?.alive) return;
    net.send?.({ t: "surrender" });
  },

  pvpScout: (seat) => {
    const { pvp } = get();
    if (pvp) set({ pvp: { ...pvp, scout: seat === pvp.scout ? null : seat } });
  },

  pvpWatch: () => {
    const { pvp } = get();
    if (pvp) set({ pvp: { ...pvp, watching: true } });
  },

  pvpSelfOffline: (offline) => {
    const { pvp } = get();
    if (pvp) set({ pvp: { ...pvp, selfOffline: offline } });
  },

  pvpConnectionLost: () => {
    const { pvp } = get();
    if (pvp) set({ pvp: { ...pvp, selfOffline: false, connLost: true } });
  },

  pvpOutdated: () => {
    const { pvp } = get();
    if (pvp) set({ pvp: { ...pvp, selfOffline: false, connLost: true, outdated: true } });
  },

  pvpQuit: () => {
    set({ ...initialState(), ...savedRun() });
  },

  // ---------- ghost battles (leaderboard scrims) ----------
  ghostFight: (board, name) => {
    const state = get();
    if (state.phase !== "prep" || state.pvp || state.pendingEvolution) return;
    const mine = wireBoard(state.units);
    if (mine.length === 0 || board.length === 0) return;

    const myFighters = mine.map((u) => makeFighter(u.formId, `m_${u.uid}`, "player", u.col, u.row, 1, u.items));
    applySynergies(myFighters, mine.map((u) => wireToUnit(`m_${u.uid}`, u)));
    const ghostFighters = board.map((u, i) =>
      makeFighter(u.formId, `g_${u.uid ?? i}`, "enemy", mirrorCol(u.col), mirrorRow(u.row), 1, u.items ?? []),
    );
    applySynergies(ghostFighters, board.map((u, i) => wireToUnit(`g_${u.uid ?? i}`, u)));

    sfx.battleStart();
    set({
      phase: "battle",
      battleSeq: get().battleSeq + 1,
      meter: {},
      ghost: { name },
      viewFlip: false,
      result: null,
      boardSnapshot: state.units,
      fighters: [...myFighters, ...ghostFighters],
      corpses: [],
      fx: [],
      battleTime: 0,
      tick: 0,
      inspected: null,
    });
  },

  ghostReturn: () => {
    const state = get();
    set({
      phase: "prep",
      result: null,
      fighters: [],
      corpses: [],
      fx: [],
      ghost: null,
      units: state.boardSnapshot ?? state.units,
      boardSnapshot: null,
    });
  },
}));

// ---------- run persistence (localStorage) ----------
// V3 rules (tiers by stage) keep their own save: a run saved under the old rules
// (rookie shop, levels 3–8) doesn't carry over — it stays where it is, untouched.
const SAVE_KEY = "dac-save-v3";

function saveRun() {
  const s = useGame.getState();
  if (s.phase !== "prep" || s.gameOver || s.pendingEvolution || s.pvp) return;
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        gold: s.gold, level: s.level, xp: s.xp, health: s.health, round: s.round, runSeed: s.runSeed,
        streak: s.streak, units: s.units, inventory: s.inventory, shop: s.shop,
        discovered: s.discovered, shopLocked: s.shopLocked, uidCounter,
      }),
    );
  } catch { /* ignore */ }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
useGame.subscribe(() => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveRun, 400);
});

/** The saved solo run, if any — loaded at start-up and after a VS match (which
 *  never overwrites it). */
function savedRun(): Partial<GameState> {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return {};
    const d = JSON.parse(raw);
    if (!Array.isArray(d.units) || typeof d.round !== "number") return {};
    uidCounter = Math.max(uidCounter, Number(d.uidCounter) || 0, 1000);
    return {
      gold: d.gold, level: d.level, xp: d.xp, health: d.health, round: d.round,
      // a run saved before bosses varied keeps the classic ones
      runSeed: Number(d.runSeed) || 0,
      streak: d.streak, units: d.units, inventory: d.inventory ?? [], shop: d.shop,
      // a run saved before discovery: what it holds counts as discovered
      discovered: Array.isArray(d.discovered) ? d.discovered : discover([], d.units),
      shopLocked: !!d.shopLocked, phase: "prep",
    };
  } catch {
    return {};
  }
}
useGame.setState(savedRun());

// ---------- VS helpers that drive the store from outside an action ----------

/** Units an augment grants go to the bench (merging like a purchase); with the
 *  bench full they're paid out in gold instead. */
function grantUnits(formIds: string[]) {
  for (const formId of formIds) {
    const s = useGame.getState();
    const slot = firstEmptyBench(s.units);
    if (slot === null) {
      useGame.setState({ gold: s.gold + costOf(formId) });
      continue;
    }
    const granted: Unit = { uid: nextUid(), formId, placement: { kind: "bench", slot }, items: [] };
    const resolved = resolveEvolutions([...s.units, granted]);
    const last = resolved.evolved[resolved.evolved.length - 1];
    useGame.setState({
      units: resolved.units,
      ...discovery(s.discovered, resolved.units),
      pendingEvolution: resolved.pending,
      inventory: [...s.inventory, ...resolved.spill],
      ...(last ? { evoFlash: { ...last, key: Date.now() } } : {}),
    });
  }
}

/** The carousel: our pick (or the one the room handed us) goes into the tray once;
 *  while the draft runs, the planning clock waits for it. */
function collectCarousel(snap: LobbySnapshot) {
  const s = useGame.getState();
  const pvp = s.pvp;
  const c = snap.carousel;
  if (!pvp || !c || c.round !== s.round) return;
  const got = carouselPick(c, pvp.seat);
  const prepEndsAt = c.opensAt ? Math.max(pvp.prepEndsAt, carouselEnd(c) + AFTER_CAROUSEL_MS) : pvp.prepEndsAt;
  if (got && pvp.carouselGot !== c.round) {
    sfx.equip();
    useGame.setState({ inventory: [...s.inventory, got], pvp: { ...pvp, carouselGot: c.round, prepEndsAt } });
  } else if (prepEndsAt !== pvp.prepEndsAt && !pvp.myReady) {
    useGame.setState({ pvp: { ...pvp, prepEndsAt } });
  }
}

/** Set while a fight is fast-forwarded: no sounds for a fight nobody watches. */
let silent = false;

/** Play the rest of the fight on screen instantly (the room has moved on). */
function finishBattleNow() {
  silent = true;
  try {
    for (let i = 0; i < FIGHT_STEPS && useGame.getState().phase === "battle"; i++) useGame.getState().stepBattle(SIM_DT);
  } finally {
    silent = false;
  }
}

/**
 * The room is ahead of us — we were offline, or idled on a result screen while
 * the others played on (our last board fought for us): skip to its round, then
 * watch the fight in progress or make sure the room has our ready.
 */
function catchUp(snap: LobbySnapshot, lastFight?: LobbyFight) {
  const g = useGame.getState;
  if (g().phase === "battle") return;
  // our board fought this one while we were away: still collect what it won
  if (
    g().phase === "prep" &&
    lastFight?.match === snap.match &&
    lastFight.round === g().round &&
    snap.round > lastFight.round &&
    g().pvp?.fight?.round !== lastFight.round
  ) {
    const seat = g().pvp!.seat;
    const seats = Object.keys(lastFight.boards).map(Number);
    const mine = seats.includes(seat)
      ? roundOutcomes(lastFight.round, lastFight.plan, lastFight.boards, seats, lastFight.augments ?? {}, lastFight.variant ?? 0).find(
          (o) => o.seat === seat,
        )
      : undefined;
    if (mine) {
      const s = g();
      const r = vsRewards(lastFight.round, mine, s.streak);
      useGame.setState({ gold: s.gold + r.gold, streak: r.streak, inventory: [...s.inventory, ...r.items].slice(0, 10) });
    }
  }
  for (let guard = 0; guard < 60; guard++) {
    // one round behind on the result screen is the normal pace
    if (g().round >= snap.round - (g().phase === "result" ? 1 : 0)) break;
    g().toPrep();
  }
  const s = g();
  const pvp = s.pvp;
  if (!pvp || s.round !== snap.round || s.phase !== "prep") return;
  if (snap.fighting && lastFight?.round === snap.round && lastFight.match === snap.match) {
    s.pvpFight(lastFight); // it started without us: watch it from the top
  } else if (!snap.fighting && pvp.myReady && pvp.lastReady && !snap.seats.find((x) => x.seat === pvp.seat)?.ready) {
    net.send?.({ t: "ready", round: s.round, board: pvp.lastReady }); // the room lost our ready
  }
}

// Dev convenience: poke the store from the browser console (balancing, debugging).
if (import.meta.env.DEV) {
  (window as unknown as { game: typeof useGame; FORMS: typeof FORMS }).game = useGame;
  (window as unknown as { FORMS: typeof FORMS }).FORMS = FORMS;
}
