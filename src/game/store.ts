import { create } from "zustand";
import type { Fighter, PendingEvolution, Phase, Placement, Unit } from "./types";
import { FORMS, ROOKIE_IDS, sellValue } from "./creatures";
import { makeFighter, stepCombat, SIM_DT, type CombatEvent } from "./battle";
import { applySynergies } from "./synergies";
import { BASE_ITEM_IDS, ITEMS, fuseResult } from "./items";
import {
  ECONOMY,
  SHOP_ODDS,
  VS,
  isArsenalRound,
  isBossRound,
  makeEnemyWave,
  makeVsWave,
  vsRoundKind,
  vsStageDamage,
} from "./tuning";
import { XP_TO_NEXT, MAX_LEVEL } from "./xpView";
import { sfx, battleSfx } from "../audio/sfx";
import { BENCH_SLOTS, COLS, ROWS } from "./board";
import { net } from "../net/bus";
import { submitScore } from "../net/leaderboard";

const REROLL_COST = 2;
const SHOP_SIZE = 5;

const START_LEVEL = 3;
const START_GOLD = 10;
const START_HEALTH = 100;


let uidCounter = 0;
const nextUid = () => `u${uidCounter++}`;

/** A board unit as sent over the wire in VS matches. */
export interface PvpBoardUnit {
  uid: string;
  formId: string;
  col: number;
  row: number;
  items: string[];
}

/** Live VS-friend match state (null = solo). */
export interface PvpState {
  code: string;
  side: "A" | "B";
  oppName: string | null;
  oppOnline: boolean;
  myReady: boolean;
  oppReady: boolean;
  oppHealth: number;
  matchOver: "win" | "lose" | "draw" | null;
  oppLeft: boolean;
  /** end-of-fight state hashes (host's relayed vs ours) — must match */
  hostHash: string | null;
  localHash: string | null;
  /** round whose result was already applied (results can arrive twice after a rejoin) */
  resultRound: number;
  /** board we last readied with — resent after a reconnect */
  lastReady: PvpBoardUnit[] | null;
  /** our socket dropped; reconnecting */
  selfOffline: boolean;
  /** gave up reconnecting */
  connLost: boolean;
  /** opponent's socket dropped; waiting out the grace period */
  oppDisconnected: boolean;
  /** after the match: who has asked for a rematch */
  rematchMe: boolean;
  rematchOpp: boolean;
  /** the opponent's board as they arrange it (live scouting during prep) */
  oppBoard: PvpBoardUnit[] | null;
  /** planning deadline (ms epoch); 0 = no timer running */
  prepEndsAt: number;
  /** wild/boss rounds: the opponent's result, simulated locally from their board */
  pveOpp: { win: boolean; damage: number } | null;
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

function rollShop(level: number): string[] {
  const odds = SHOP_ODDS[Math.max(3, Math.min(8, level))];
  const total = odds.reduce((a, b) => a + b, 0);
  const tierPick = () => {
    let r = Math.random() * total;
    for (let t = 0; t < odds.length; t++) {
      r -= odds[t];
      if (r < 0) return t + 1;
    }
    return 1;
  };
  return Array.from({ length: SHOP_SIZE }, () => {
    const tier = tierPick();
    const pool = ROOKIE_IDS.filter((id) => (FORMS[id].cost ?? 2) === tier);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : ROOKIE_IDS[0];
  });
}

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

const interest = (gold: number) => Math.min(Math.floor(gold / 10), 5);
const streakBonus = (streak: number) => {
  const a = Math.abs(streak);
  return a >= 4 ? 3 : a >= 3 ? 2 : a >= 2 ? 1 : 0;
};

/**
 * Resolve digivolutions after a unit changes. Auto-evolves any 3-of-a-kind whose
 * form has a single branch (looping), and stops at the first 3-of-a-kind that has
 * multiple branches — returning a PendingEvolution for the player to choose.
 */
function resolveEvolutions(
  units: Unit[],
): { units: Unit[]; pending: PendingEvolution | null; evolved: { from: string; to: string; uid: string }[] } {
  let current = units;
  const evolved: { from: string; to: string; uid: string }[] = [];
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
        current = current
          .filter((u) => !consumed.has(u.uid))
          .map((u) => (u.uid === keep.uid ? { ...u, formId: form.evolvesTo![0] } : u));
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
      };
    }
    if (!acted) break;
  }
  return { units: current, pending: null, evolved };
}

interface GameState {
  gold: number;
  level: number;
  xp: number;
  health: number;
  round: number;
  streak: number;
  gameOver: boolean;

  shop: string[];
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
  /** VS "Arsenal" round: three items to choose one from */
  arsenal: string[] | null;
  /** rewards of the round that just ended (result screen) */
  loot: { gold: number; items: string[] } | null;
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

  pvpJoined: (
    code: string,
    side: "A" | "B",
    players: { A: string | null; B: string | null; online: string[] },
    rejoin?: boolean,
  ) => void;
  pvpPeer: (players: { A: string | null; B: string | null; online: string[] }) => void;
  pvpReadyUp: (force?: boolean) => void;
  pvpOppReady: () => void;
  pvpFight: (boards: Record<"A" | "B", PvpBoardUnit[]>) => void;
  pvpResult: (winner: "A" | "B" | "draw", damage: number, hash?: string, round?: number) => void;
  pvpResendReady: () => void;
  pvpOpponentForfeit: () => void;
  pvpSelfOffline: (offline: boolean) => void;
  pvpConnectionLost: () => void;
  pvpLeft: () => void;
  pvpSurrender: () => void;
  pvpSurrendered: (side: "A" | "B") => void;
  pvpQuit: () => void;
  pickArsenal: (id: string) => void;
  pvpOppBoard: (board: PvpBoardUnit[]) => void;
  /** planning timer ran out: settle open choices and ready with the current board */
  pvpAutoReady: () => void;
  pvpRequestRematch: () => void;
  pvpRematchOffered: () => void;
  pvpRematchStart: () => void;

  ghostFight: (board: PvpBoardUnit[], name: string) => void;
  ghostReturn: () => void;
}

const touchDevice = () => typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
/** When the VS planning phase that starts now runs out. */
const planDeadline = () => Date.now() + (touchDevice() ? VS.planSecondsTouch : VS.planSeconds) * 1000;

const randomOf = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const FUSED_IDS = Object.values(ITEMS)
  .filter((d) => d.from)
  .map((d) => d.id);

/** Three different base items; the player behind on health also gets a fused one
 *  (the catch-up of TFT's carousel, where the weakest picks first). */
function arsenalOffer(behind: boolean): string[] {
  const pool = [...BASE_ITEM_IDS].sort(() => Math.random() - 0.5).slice(0, 3);
  if (behind) pool[2] = randomOf(FUSED_IDS);
  return pool;
}

/** One player's wild/boss fight: their board (rows 0-2) against the round's wave.
 *  Built identically on both clients so the opponent's result can be simulated
 *  locally instead of being sent over the wire. */
export function pveFighters(board: PvpBoardUnit[], round: number, side: "A" | "B"): Fighter[] {
  const mine = board.map((u) => makeFighter(u.formId, `${side}_${u.uid}`, "player", u.col, u.row, 1, u.items ?? []));
  applySynergies(mine, board.map((u) => wireToUnit(`${side}_${u.uid}`, u)));
  return [...mine, ...makeVsWave(round)];
}

/** Run a fight to the end without rendering; returns how the board side fared. */
export function simulate(fighters: Fighter[]): { win: boolean; survivors: number } {
  for (let i = 0; i < 4000; i++) {
    const players = fighters.some((f) => f.hp > 0 && f.team === "player");
    const enemies = fighters.some((f) => f.hp > 0 && f.team === "enemy");
    if (!players || !enemies) break;
    stepCombat(fighters, SIM_DT);
  }
  const survivors = fighters.filter((f) => f.hp > 0 && f.team === "enemy").length;
  return { win: survivors === 0 && fighters.some((f) => f.hp > 0 && f.team === "player"), survivors };
}

/** Run state for a fresh VS match — both players start equal. */
function freshMatchRun() {
  return {
    gold: START_GOLD,
    level: START_LEVEL,
    xp: 0,
    health: START_HEALTH,
    round: 1,
    streak: 0,
    gameOver: false,
    units: [] as Unit[],
    inventory: [] as string[],
    shop: rollShop(START_LEVEL),
    shopLocked: false,
    phase: "prep" as Phase,
    result: null,
    fighters: [] as Fighter[],
    corpses: [] as Fighter[],
    fx: [] as Fx[],
    pendingEvolution: null,
    inspected: null,
    arsenal: null,
    loot: null,
  };
}

function readSpeed(): number {
  try {
    return localStorage.getItem("dac-speed") === "2" ? 2 : 1;
  } catch {
    return 1;
  }
}

function initialState() {
  return {
    gold: START_GOLD,
    level: START_LEVEL,
    xp: 0,
    health: START_HEALTH,
    round: 1,
    streak: 0,
    gameOver: false,
    shop: rollShop(START_LEVEL),
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
    arsenal: null as string[] | null,
    loot: null as { gold: number; items: string[] } | null,
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

/** FNV-1a over the end-of-fight state: both PvP clients must produce the same value. */
function fightHash(fighters: Fighter[], tick: number): string {
  let h = (2166136261 ^ tick) >>> 0;
  const text = fighters
    .map((f) => `${f.uid}:${Math.round(f.hp * 1000)}`)
    .sort()
    .join("|");
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function checkPvpSync(pvp: PvpState) {
  if (!pvp.hostHash || !pvp.localHash) return;
  if (pvp.hostHash === pvp.localHash) console.info("[pvp] fight in sync", pvp.localHash);
  else console.warn("[pvp] DESYNC: host", pvp.hostHash, "local", pvp.localHash);
}

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
    const { gold } = get();
    if (gold < REROLL_COST) return;
    sfx.reroll();
    set({ gold: gold - REROLL_COST, shop: rollShop(get().level) });
  },

  buy: (shopIndex) => {
    const { gold, shop, units, pendingEvolution } = get();
    if (pendingEvolution) return;
    const formId = shop[shopIndex];
    if (!formId) return;
    const form = FORMS[formId];
    if (gold < (form.cost ?? 99)) return;
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
      gold: gold - (form.cost ?? 0),
      shop: newShop,
      units: resolved.units,
      pendingEvolution: resolved.pending,
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
    remaining.push({ uid: evolvedUid, formId, placement: pendingEvolution.placement, items: pooled.slice(0, 2) });
    const resolved = resolveEvolutions(remaining);
    sfx.evolve();
    const last = resolved.evolved[resolved.evolved.length - 1];
    const flash = last ?? { from: pendingEvolution.fromFormId, to: formId, uid: evolvedUid };
    set({
      units: resolved.units,
      pendingEvolution: resolved.pending,
      inventory: [...inventory, ...pooled.slice(2)],
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
      gold: gold + sellValue(u.formId),
      inventory: [...inventory, ...(u.items ?? [])],
      inspected: null,
    });
  },

  equipItem: (uid) => {
    const { selectedItem, inventory, units } = get();
    if (!selectedItem) return;
    const unit = units.find((u) => u.uid === uid);
    if (!unit || (unit.items ?? []).length >= 2) return;
    const idx = inventory.indexOf(selectedItem);
    if (idx < 0) return;
    const nextInv = [...inventory];
    nextInv.splice(idx, 1);
    sfx.equip();
    set({
      units: units.map((u) => (u.uid === uid ? { ...u, items: [...(u.items ?? []), selectedItem] } : u)),
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

    if (target.kind === "board" && moving.placement.kind === "bench" && !occupant && boardCount(units) >= level) {
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
    const { units, round, pendingEvolution } = get();
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
      fighters: [...playerFighters, ...makeEnemyWave(round)],
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
    for (const e of events) battleSfx(e);
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

    if (!playersLeft || !enemiesLeft) {
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
      if (state.pvp && vsRoundKind(state.round) !== "pvp") {
        const kind = vsRoundKind(state.round);
        const survivors = alive.filter((fr) => fr.team === "enemy").length;
        const damage = win ? 0 : vsStageDamage(state.round) + survivors;
        const opp = state.pvp.pveOpp ?? { win: true, damage: 0 };
        const health = Math.max(0, state.health - damage);
        const oppHealth = Math.max(0, state.pvp.oppHealth - opp.damage);
        // loot: wild rounds drop a base item, bosses a fused one; a loss still pays 1
        const items = win ? [randomOf(kind === "boss" ? FUSED_IDS : BASE_ITEM_IDS)] : [];
        const lootGold = win ? (kind === "boss" ? 4 : 2) : 1;
        const matchOver: PvpState["matchOver"] =
          health <= 0 && oppHealth <= 0 ? "draw" : health <= 0 ? "lose" : oppHealth <= 0 ? "win" : null;
        if (matchOver === "win") submitScore({ winsDelta: 1 });
        if (win) sfx.win();
        else sfx.lose();
        if (items.length) sfx.drop();
        set({
          phase: "result",
          result: win ? "win" : "lose",
          fighters: alive,
          corpses,
          fx,
          meter,
          battleTime: bt,
          tick: state.tick + 1,
          health,
          lastDamage: damage,
          gold: state.gold + lootGold,
          inventory: [...state.inventory, ...items].slice(0, 10),
          loot: { gold: lootGold, items },
          pvp: { ...state.pvp, oppHealth, matchOver, resultRound: state.round, pveOpp: null },
        });
        return;
      }
      if (state.pvp) {
        // VS match: both clients run the SAME canonical fight (host = "player",
        // guest = "enemy"); the host reports the result and BOTH apply health
        // when the relayed message arrives. Hashes prove the sims agreed.
        const myTeam = state.viewFlip ? "enemy" : "player";
        const iWon = alive.some((f) => f.team === myTeam) && !alive.some((f) => f.team !== myTeam);
        const hash = fightHash(alive, state.tick + 1);
        if (state.pvp.side === "A") {
          net.send?.({
            t: "result",
            round: state.round,
            winner: playersLeft && !enemiesLeft ? "A" : enemiesLeft && !playersLeft ? "B" : "draw",
            damage: vsStageDamage(state.round) + alive.length,
            hash,
          });
        }
        if (iWon) sfx.win();
        else sfx.lose();
        const pvp = { ...state.pvp, localHash: hash };
        checkPvpSync(pvp);
        set({
          phase: "result",
          result: iWon ? "win" : "lose",
          fighters: alive,
          corpses,
          fx,
          meter,
          battleTime: bt,
          tick: state.tick + 1,
          pvp,
        });
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
      const inventory =
        win && state.inventory.length < 8 && (bossBonus || Math.random() < 0.55)
          ? [...state.inventory, BASE_ITEM_IDS[Math.floor(Math.random() * BASE_ITEM_IDS.length)]]
          : state.inventory;
      if (win) sfx.win();
      else sfx.lose();
      if (inventory.length > state.inventory.length) sfx.drop();
      if (health <= 0) {
        try {
          const best = Number(localStorage.getItem("dac-best-round") ?? 0);
          if (state.round > best) localStorage.setItem("dac-best-round", String(state.round));
          localStorage.removeItem("dac-save");
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
    const income = ECONOMY.baseIncome + interest(state.gold) + streakBonus(state.streak);
    const leveled = gainXp(state.level, state.xp, ECONOMY.passiveXp);
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
      shop: state.shopLocked ? state.shop : rollShop(leveled.level),
      viewFlip: false,
      loot: null,
      arsenal: state.pvp && isArsenalRound(state.round + 1) ? arsenalOffer(state.health < state.pvp.oppHealth) : null,
      ...(state.pvp
        ? { pvp: { ...state.pvp, myReady: false, oppReady: false, prepEndsAt: planDeadline(), pveOpp: null } }
        : {}),
    });
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

  // ---------- VS friend (multiplayer) ----------
  pvpJoined: (code, side, players, rejoin = false) => {
    const other = side === "A" ? "B" : "A";
    const state = get();
    if (rejoin && state.pvp) {
      // back after a dropped connection: keep the run, just refresh presence
      set({
        pvp: {
          ...state.pvp,
          side,
          oppName: players[other],
          oppOnline: players.online.includes(other),
          oppDisconnected: state.pvp.oppDisconnected && !players.online.includes(other),
          selfOffline: false,
        },
      });
      return;
    }
    set({
      pvp: {
        code,
        side,
        oppName: players[other],
        oppOnline: players.online.includes(other),
        myReady: false,
        oppReady: false,
        oppHealth: START_HEALTH,
        matchOver: null,
        oppLeft: false,
        hostHash: null,
        localHash: null,
        resultRound: 0,
        lastReady: null,
        selfOffline: false,
        connLost: false,
        oppDisconnected: false,
        rematchMe: false,
        rematchOpp: false,
        oppBoard: null,
        prepEndsAt: players.online.includes(other) ? planDeadline() : 0,
        pveOpp: null,
      },
      ...freshMatchRun(),
    });
  },

  pickArsenal: (id) => {
    const { arsenal, inventory } = get();
    if (!arsenal?.includes(id)) return;
    sfx.equip();
    set({ arsenal: null, inventory: [...inventory, id] });
  },

  pvpOppBoard: (board) => {
    const { pvp } = get();
    if (pvp) set({ pvp: { ...pvp, oppBoard: board } });
  },

  pvpAutoReady: () => {
    const s = get();
    if (!s.pvp || s.pvp.myReady || s.phase !== "prep") return;
    for (let i = 0; i < 4 && get().pendingEvolution; i++) get().chooseEvolution(get().pendingEvolution!.options[0]);
    const offer = get().arsenal;
    if (offer) get().pickArsenal(offer[0]);
    get().pvpReadyUp(true);
  },

  pvpRequestRematch: () => {
    const { pvp } = get();
    if (!pvp?.matchOver || pvp.rematchMe || pvp.oppLeft) return;
    net.send?.({ t: "rematch" });
    sfx.click();
    set({ pvp: { ...pvp, rematchMe: true } });
  },

  pvpRematchOffered: () => {
    const { pvp } = get();
    if (!pvp) return;
    sfx.buy();
    set({ pvp: { ...pvp, rematchOpp: true } });
  },

  pvpRematchStart: () => {
    const { pvp } = get();
    if (!pvp) return;
    sfx.battleStart();
    set({
      pvp: {
        ...pvp,
        myReady: false,
        oppReady: false,
        oppHealth: START_HEALTH,
        matchOver: null,
        oppLeft: false,
        hostHash: null,
        localHash: null,
        resultRound: 0,
        lastReady: null,
        rematchMe: false,
        rematchOpp: false,
        oppBoard: null,
        prepEndsAt: planDeadline(),
        pveOpp: null,
      },
      ...freshMatchRun(),
    });
  },

  pvpPeer: (players) => {
    const { pvp } = get();
    if (!pvp) return;
    const other = pvp.side === "A" ? "B" : "A";
    const nowOnline = players.online.includes(other);
    if (nowOnline && !pvp.oppOnline) sfx.buy(); // little "friend joined" pop
    set({
      pvp: {
        ...pvp,
        oppName: players[other],
        oppOnline: nowOnline,
        oppDisconnected: nowOnline ? false : pvp.oppDisconnected,
        // the planning clock starts once both players are in the room
        prepEndsAt: nowOnline && !pvp.prepEndsAt && !pvp.myReady ? planDeadline() : pvp.prepEndsAt,
      },
    });
  },

  pvpReadyUp: (force = false) => {
    const { pvp, units, round, pendingEvolution, arsenal } = get();
    if (!pvp || pvp.myReady || ((pendingEvolution || arsenal) && !force)) return;
    const board = wireBoard(units);
    // an empty board can only go in when the planning timer forces it
    if (board.length === 0 && !force) return;
    net.send?.({ t: "ready", round, board });
    sfx.click();
    set({ pvp: { ...pvp, myReady: true, lastReady: board } });
  },

  pvpOppReady: () => {
    const { pvp } = get();
    if (pvp) set({ pvp: { ...pvp, oppReady: true } });
  },

  pvpFight: (boards) => {
    const state = get();
    const pvp = state.pvp;
    if (!pvp) return;
    if (vsRoundKind(state.round) !== "pvp") {
      // wild / boss round: each player fights the same wave on their own board.
      // Ours is rendered; theirs runs headless here — deterministic, so both
      // clients agree on both results without another message.
      const other = pvp.side === "A" ? "B" : "A";
      const opp = simulate(pveFighters(boards[other] ?? [], state.round, other));
      if (vsRoundKind(state.round) === "boss") sfx.bossIntro();
      else sfx.battleStart();
      set({
        phase: "battle",
        battleSeq: get().battleSeq + 1,
        meter: {},
        result: null,
        loot: null,
        boardSnapshot: state.units,
        fighters: pveFighters(boards[pvp.side] ?? [], state.round, pvp.side),
        viewFlip: false,
        pvp: {
          ...pvp,
          hostHash: null,
          localHash: null,
          oppBoard: boards[other] ?? pvp.oppBoard,
          pveOpp: { win: opp.win, damage: opp.win ? 0 : vsStageDamage(state.round) + opp.survivors },
        },
        corpses: [],
        fx: [],
        battleTime: 0,
        tick: 0,
      });
      return;
    }
    // Canonical fight, identical on both clients: host board A on rows 0-2 as
    // "player", guest board B mirrored onto rows 3-5 as "enemy", order [A..., B...].
    // The guest only renders it mirrored (viewFlip), so their own units still
    // appear at the bottom.
    const A = boards.A ?? [];
    const B = boards.B ?? [];
    const aFighters = A.map((u) => makeFighter(u.formId, `A_${u.uid}`, "player", u.col, u.row, 1, u.items));
    applySynergies(aFighters, A.map((u) => wireToUnit(`A_${u.uid}`, u)));
    const bFighters = B.map((u) =>
      makeFighter(u.formId, `B_${u.uid}`, "enemy", mirrorCol(u.col), mirrorRow(u.row), 1, u.items),
    );
    applySynergies(bFighters, B.map((u) => wireToUnit(`B_${u.uid}`, u)));

    sfx.battleStart();
    set({
      phase: "battle",
      battleSeq: get().battleSeq + 1,
      meter: {},
      result: null,
      boardSnapshot: state.units,
      // alternate who acts first each round so perfect mirror fights don't
      // always favor the same side (both clients agree: same round number)
      fighters: state.round % 2 === 1 ? [...aFighters, ...bFighters] : [...bFighters, ...aFighters],
      viewFlip: pvp.side === "B",
      loot: null,
      pvp: { ...pvp, hostHash: null, localHash: null, oppBoard: (pvp.side === "A" ? B : A) ?? pvp.oppBoard },
      corpses: [],
      fx: [],
      battleTime: 0,
      tick: 0,
    });
  },

  pvpResult: (winner, damage, hash, round) => {
    const state = get();
    const pvp0 = state.pvp;
    const resultRound = round ?? state.round;
    if (!pvp0 || pvp0.matchOver || pvp0.resultRound === resultRound) return;
    const pvp = { ...pvp0, hostHash: hash ?? null, resultRound };
    checkPvpSync(pvp);
    const iWon = winner === pvp.side;
    const draw = winner === "draw";
    const health = Math.max(0, state.health - (iWon ? 0 : damage));
    const oppHealth = Math.max(0, pvp.oppHealth - (iWon && !draw ? damage : draw ? damage : 0));
    const streak = draw ? 0 : iWon ? Math.max(1, state.streak + 1) : Math.min(-1, state.streak - 1);
    // items come from Arsenal and wild/boss rounds now; a PvP win pays gold
    const winGold = iWon && !draw ? ECONOMY.winGold : 0;
    const inventory = state.inventory;
    const matchOver: PvpState["matchOver"] =
      health <= 0 && oppHealth <= 0 ? "draw" : health <= 0 ? "lose" : oppHealth <= 0 ? "win" : null;
    if (matchOver === "win") submitScore({ winsDelta: 1 });
    set({
      health,
      streak,
      inventory,
      gold: state.gold + winGold,
      loot: winGold ? { gold: winGold, items: [] } : null,
      lastDamage: iWon && !draw ? 0 : damage,
      pvp: { ...pvp, oppHealth, matchOver },
    });
  },

  pvpLeft: () => {
    const { pvp } = get();
    if (!pvp || pvp.matchOver) return;
    // opponent's connection dropped — they may be back (phones kill sockets when
    // switching apps); the net layer awards a forfeit after the grace period
    set({ pvp: { ...pvp, oppOnline: false, oppDisconnected: true } });
  },

  pvpOpponentForfeit: () => {
    const { pvp } = get();
    if (!pvp || pvp.matchOver || pvp.oppOnline) return;
    sfx.win();
    submitScore({ winsDelta: 1 });
    set({ pvp: { ...pvp, oppLeft: true, oppDisconnected: false, matchOver: "win" } });
  },

  pvpSelfOffline: (offline) => {
    const { pvp } = get();
    if (pvp) set({ pvp: { ...pvp, selfOffline: offline } });
  },

  pvpConnectionLost: () => {
    const { pvp } = get();
    if (pvp) set({ pvp: { ...pvp, selfOffline: false, connLost: true } });
  },

  pvpResendReady: () => {
    const { pvp, round } = get();
    if (!pvp || !pvp.lastReady) return;
    net.send?.({ t: "ready", round, board: pvp.lastReady });
  },

  pvpSurrender: () => {
    const { pvp } = get();
    if (!pvp || pvp.matchOver) return;
    net.send?.({ t: "surrender" });
    // the relay echoes to everyone (including us) — matchOver applies there
  },

  pvpSurrendered: (side) => {
    const { pvp } = get();
    if (!pvp || pvp.matchOver) return;
    const mine = side === pvp.side;
    if (mine) sfx.lose();
    else {
      sfx.win();
      submitScore({ winsDelta: 1 });
    }
    set({ pvp: { ...pvp, matchOver: mine ? "lose" : "win" } });
  },

  pvpQuit: () => {
    set({ ...initialState() });
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
const SAVE_KEY = "dac-save";

function saveRun() {
  const s = useGame.getState();
  if (s.phase !== "prep" || s.gameOver || s.pendingEvolution || s.pvp) return;
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        gold: s.gold, level: s.level, xp: s.xp, health: s.health, round: s.round,
        streak: s.streak, units: s.units, inventory: s.inventory, shop: s.shop,
        shopLocked: s.shopLocked, uidCounter,
      }),
    );
  } catch { /* ignore */ }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
useGame.subscribe(() => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveRun, 400);
});

try {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) {
    const d = JSON.parse(raw);
    if (Array.isArray(d.units) && typeof d.round === "number") {
      uidCounter = Math.max(Number(d.uidCounter) || 0, 1000);
      useGame.setState({
        gold: d.gold, level: d.level, xp: d.xp, health: d.health, round: d.round,
        streak: d.streak, units: d.units, inventory: d.inventory ?? [], shop: d.shop,
        shopLocked: !!d.shopLocked, phase: "prep",
      });
    }
  }
} catch { /* ignore */ }

// Dev convenience: poke the store from the browser console (balancing, debugging).
if (import.meta.env.DEV) {
  (window as unknown as { game: typeof useGame; FORMS: typeof FORMS }).game = useGame;
  (window as unknown as { FORMS: typeof FORMS }).FORMS = FORMS;
}
