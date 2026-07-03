import { create } from "zustand";
import type { Fighter, PendingEvolution, Phase, Placement, Unit } from "./types";
import { FORMS, ROOKIE_IDS, ALL_FORM_IDS } from "./creatures";
import { makeFighter, stepCombat, type CombatEvent } from "./battle";
import { applySynergies } from "./synergies";
import { ITEM_IDS } from "./items";
import { XP_TO_NEXT, MAX_LEVEL } from "./xpView";
import { BENCH_SLOTS, COLS } from "./board";

const REROLL_COST = 2;
const SHOP_SIZE = 5;
const BASE_INCOME = 5;
const XP_COST = 4;
const XP_PER_BUY = 4;

const START_LEVEL = 3;
const START_GOLD = 10;
const START_HEALTH = 100;

// Shop appearance weight by cost (cheaper shows up more — keeps 3-of-a-kind reachable).
const COST_WEIGHT: Record<number, number> = { 1: 40, 2: 30, 3: 18, 4: 12 };

let uidCounter = 0;
const nextUid = () => `u${uidCounter++}`;

/** A live combat effect (damage number, projectile, death burst) with its spawn time. */
export interface Fx extends CombatEvent {
  id: string;
  born: number; // battleTime seconds
  jx: number; // small positional jitter so stacked numbers don't overlap
  jz: number;
}
let fxCounter = 0;
const FX_TTL = 1.0; // seconds an effect stays in the list

function rollShop(): string[] {
  const pool: string[] = [];
  for (const id of ROOKIE_IDS) {
    const w = COST_WEIGHT[FORMS[id].cost ?? 2] ?? 10;
    for (let i = 0; i < w; i++) pool.push(id);
  }
  return Array.from({ length: SHOP_SIZE }, () => pool[Math.floor(Math.random() * pool.length)]);
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

function makeEnemyWave(round: number): Fighter[] {
  const count = Math.min(3 + Math.floor((round - 1) / 2), 7);
  const stage = round >= 7 ? 3 : round >= 4 ? 2 : 1;
  const pool = ALL_FORM_IDS.filter((id) => FORMS[id].stage === stage);
  const hpScale = 1 + (round - 1) * 0.05;
  return Array.from({ length: count }, (_, i) =>
    makeFighter(pool[(round * 3 + i * 5) % pool.length], `e${i}`, "enemy", i % COLS, 5 - Math.floor(i / COLS), hpScale),
  );
}

/**
 * Resolve digivolutions after a unit changes. Auto-evolves any 3-of-a-kind whose
 * form has a single branch (looping), and stops at the first 3-of-a-kind that has
 * multiple branches — returning a PendingEvolution for the player to choose.
 */
function resolveEvolutions(units: Unit[]): { units: Unit[]; pending: PendingEvolution | null } {
  let current = units;
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
      };
    }
    if (!acted) break;
  }
  return { units: current, pending: null };
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
  pendingEvolution: PendingEvolution | null;
  phase: Phase;
  result: "win" | "lose" | null;
  lastDamage: number;

  fighters: Fighter[];
  fx: Fx[];
  battleTime: number;
  tick: number;
  boardSnapshot: Unit[] | null;

  dragId: string | null;
  dragPos: { x: number; z: number } | null;

  reroll: () => void;
  buy: (shopIndex: number) => void;
  buyXp: () => void;
  chooseEvolution: (formId: string) => void;
  selectItem: (id: string | null) => void;
  equipItem: (uid: string) => void;
  setInspected: (uid: string | null) => void;
  moveUnit: (uid: string, target: Placement) => void;
  setDrag: (uid: string | null, pos: { x: number; z: number } | null) => void;
  startBattle: () => void;
  stepBattle: (dt: number) => void;
  toPrep: () => void;
  reset: () => void;
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
    shop: rollShop(),
    units: [] as Unit[],
    inventory: [] as string[],
    selectedItem: null as string | null,
    inspected: null as string | null,
    pendingEvolution: null as PendingEvolution | null,
    phase: "prep" as Phase,
    result: null as "win" | "lose" | null,
    lastDamage: 0,
    fighters: [] as Fighter[],
    fx: [] as Fx[],
    battleTime: 0,
    tick: 0,
    boardSnapshot: null as Unit[] | null,
    dragId: null as string | null,
    dragPos: null as { x: number; z: number } | null,
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

export const useGame = create<GameState>((set, get) => ({
  ...initialState(),

  reroll: () => {
    const { gold } = get();
    if (gold < REROLL_COST) return;
    set({ gold: gold - REROLL_COST, shop: rollShop() });
  },

  buy: (shopIndex) => {
    const { gold, shop, units, pendingEvolution } = get();
    if (pendingEvolution) return;
    const formId = shop[shopIndex];
    if (!formId) return;
    const form = FORMS[formId];
    if (gold < (form.cost ?? 99)) return;
    const slot = firstEmptyBench(units);
    if (slot === null) return; // bench full
    const newUnit: Unit = { uid: nextUid(), formId, placement: { kind: "bench", slot }, items: [] };
    const newShop = [...shop];
    newShop[shopIndex] = "";
    const resolved = resolveEvolutions([...units, newUnit]);
    set({
      gold: gold - (form.cost ?? 0),
      shop: newShop,
      units: resolved.units,
      pendingEvolution: resolved.pending,
    });
  },

  buyXp: () => {
    const { gold, level, xp } = get();
    if (level >= MAX_LEVEL || gold < XP_COST) return;
    set({ gold: gold - XP_COST, ...gainXp(level, xp, XP_PER_BUY) });
  },

  chooseEvolution: (formId) => {
    const { pendingEvolution, units, inventory } = get();
    if (!pendingEvolution || !pendingEvolution.options.includes(formId)) return;
    const consumed = new Set(pendingEvolution.consume);
    const pooled = units.filter((u) => consumed.has(u.uid)).flatMap((u) => u.items ?? []);
    const remaining = units.filter((u) => !consumed.has(u.uid));
    remaining.push({ uid: nextUid(), formId, placement: pendingEvolution.placement, items: pooled.slice(0, 2) });
    const resolved = resolveEvolutions(remaining);
    set({
      units: resolved.units,
      pendingEvolution: resolved.pending,
      inventory: [...inventory, ...pooled.slice(2)],
    });
  },

  selectItem: (id) => set({ selectedItem: id }),

  setInspected: (uid) => set({ inspected: uid }),

  equipItem: (uid) => {
    const { selectedItem, inventory, units } = get();
    if (!selectedItem) return;
    const unit = units.find((u) => u.uid === uid);
    if (!unit || (unit.items ?? []).length >= 2) return;
    const idx = inventory.indexOf(selectedItem);
    if (idx < 0) return;
    const nextInv = [...inventory];
    nextInv.splice(idx, 1);
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

    set({
      phase: "battle",
      result: null,
      boardSnapshot: units,
      fighters: [...playerFighters, ...makeEnemyWave(round)],
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
    const bt = state.battleTime + dt;

    const alive = fighters.filter((fr) => fr.hp > 0);
    const playersLeft = alive.some((fr) => fr.team === "player");
    const enemiesLeft = alive.some((fr) => fr.team === "enemy");

    if (!playersLeft || !enemiesLeft) {
      const win = playersLeft;
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
      const inventory =
        win && state.inventory.length < 8 && Math.random() < 0.55
          ? [...state.inventory, ITEM_IDS[Math.floor(Math.random() * ITEM_IDS.length)]]
          : state.inventory;
      set({
        phase: "result",
        result: win ? "win" : "lose",
        fighters: alive,
        fx: [],
        battleTime: bt,
        streak,
        inventory,
        health,
        lastDamage: damage,
        gameOver: health <= 0,
        tick: state.tick + 1,
      });
    } else {
      let fx = state.fx;
      const pruned = fx.filter((f) => bt - f.born < FX_TTL);
      if (events.length > 0 || pruned.length !== fx.length) {
        fx = [
          ...pruned,
          ...events.map((e) => ({
            ...e,
            id: `fx${fxCounter++}`,
            born: bt,
            jx: (Math.random() - 0.5) * 0.35,
            jz: (Math.random() - 0.5) * 0.2,
          })),
        ];
      }
      set({ fighters: alive, fx, battleTime: bt, tick: state.tick + 1 });
    }
  },

  toPrep: () => {
    const state = get();
    if (state.gameOver) return;
    const income = BASE_INCOME + interest(state.gold) + streakBonus(state.streak);
    const leveled = gainXp(state.level, state.xp, 1);
    set({
      phase: "prep",
      result: null,
      fighters: [],
      boardSnapshot: null,
      units: state.boardSnapshot ?? state.units,
      gold: state.gold + income,
      round: state.round + 1,
      level: leveled.level,
      xp: leveled.xp,
      shop: rollShop(),
    });
  },

  reset: () => set({ ...initialState() }),
}));

// Dev convenience: poke the store from the browser console (balancing, debugging).
if (import.meta.env.DEV) {
  (window as unknown as { game: typeof useGame; FORMS: typeof FORMS }).game = useGame;
  (window as unknown as { FORMS: typeof FORMS }).FORMS = FORMS;
}
