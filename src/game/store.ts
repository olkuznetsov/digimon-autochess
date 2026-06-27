import { create } from "zustand";
import type { Fighter, Phase, Placement, Unit } from "./types";
import {
  CREATURES,
  CREATURE_IDS,
  attributeMultiplier,
  statsFor,
} from "./creatures";
import { applySynergies } from "./synergies";
import { XP_TO_NEXT, MAX_LEVEL } from "./xpView";
import { BENCH_SLOTS, COLS } from "./board";

const REROLL_COST = 2;
const SHOP_SIZE = 5;
const BASE_INCOME = 5;
const XP_COST = 4;
const XP_PER_BUY = 4;
const MOVE_SPEED = 2.2; // cells per second during battle

const START_LEVEL = 3;
const START_GOLD = 10;
const START_HEALTH = 100;

// Shop appearance weight by cost (cheaper shows up more — keeps 3-of-a-kind reachable).
const COST_WEIGHT: Record<number, number> = { 1: 40, 2: 30, 3: 18, 4: 12 };

let uidCounter = 0;
const nextUid = () => `u${uidCounter++}`;

function rollShop(): string[] {
  const pool: string[] = [];
  for (const id of CREATURE_IDS) {
    const w = COST_WEIGHT[CREATURES[id].cost] ?? 10;
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
  const star: 1 | 2 | 3 = round >= 7 ? 3 : round >= 4 ? 2 : 1;
  const hpScale = 1 + (round - 1) * 0.06;
  const pool = CREATURE_IDS;
  const fighters: Fighter[] = [];
  for (let i = 0; i < count; i++) {
    const defId = pool[(round * 3 + i * 5) % pool.length];
    const def = CREATURES[defId];
    const s = statsFor(def, star);
    fighters.push({
      uid: `e${i}`,
      defId,
      star,
      team: "enemy",
      attribute: def.attribute,
      hp: Math.round(s.hp * hpScale),
      maxHp: Math.round(s.hp * hpScale),
      attack: s.attack,
      attackSpeed: s.attackSpeed,
      range: s.range,
      col: i % COLS,
      row: 5 - Math.floor(i / COLS),
      cooldown: 0,
      moving: false,
      targetUid: null,
    });
  }
  return fighters;
}

interface GameState {
  gold: number;
  level: number;
  xp: number;
  health: number;
  round: number;
  streak: number; // + win streak, - loss streak
  gameOver: boolean;

  shop: string[];
  units: Unit[];
  phase: Phase;
  result: "win" | "lose" | null;
  lastDamage: number;

  fighters: Fighter[];
  tick: number;
  boardSnapshot: Unit[] | null;

  dragId: string | null;
  dragPos: { x: number; z: number } | null;

  reroll: () => void;
  buy: (shopIndex: number) => void;
  buyXp: () => void;
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
    phase: "prep" as Phase,
    result: null as "win" | "lose" | null,
    lastDamage: 0,
    fighters: [] as Fighter[],
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

function boardCount(units: Unit[]): number {
  return units.filter((u) => u.placement.kind === "board").length;
}

/** Combine any 3 matching (defId + star) units into one of the next star. */
function digivolve(units: Unit[]): Unit[] {
  let changed = true;
  let result = [...units];
  while (changed) {
    changed = false;
    const groups = new Map<string, Unit[]>();
    for (const u of result) {
      if (u.star === 3) continue;
      const key = `${u.defId}:${u.star}`;
      const arr = groups.get(key) ?? [];
      arr.push(u);
      groups.set(key, arr);
    }
    for (const [, arr] of groups) {
      if (arr.length >= 3) {
        const [keep, ...rest] = arr;
        const consumed = new Set(rest.slice(0, 2).map((u) => u.uid));
        result = result.filter((u) => !consumed.has(u.uid));
        result = result.map((u) =>
          u.uid === keep.uid ? { ...u, star: (keep.star + 1) as 1 | 2 | 3 } : u,
        );
        changed = true;
        break;
      }
    }
  }
  return result;
}

export const useGame = create<GameState>((set, get) => ({
  ...initialState(),

  reroll: () => {
    const { gold } = get();
    if (gold < REROLL_COST) return;
    set({ gold: gold - REROLL_COST, shop: rollShop() });
  },

  buy: (shopIndex) => {
    const { gold, shop, units } = get();
    const defId = shop[shopIndex];
    if (!defId) return;
    const def = CREATURES[defId];
    if (gold < def.cost) return;
    const slot = firstEmptyBench(units);
    if (slot === null) return; // bench full
    const newUnit: Unit = { uid: nextUid(), defId, star: 1, placement: { kind: "bench", slot } };
    const newShop = [...shop];
    newShop[shopIndex] = "";
    set({ gold: gold - def.cost, shop: newShop, units: digivolve([...units, newUnit]) });
  },

  buyXp: () => {
    const { gold, level, xp } = get();
    if (level >= MAX_LEVEL || gold < XP_COST) return;
    set({ gold: gold - XP_COST, ...gainXp(level, xp, XP_PER_BUY) });
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

    // board cap = your level
    if (
      target.kind === "board" &&
      moving.placement.kind === "bench" &&
      !occupant &&
      boardCount(units) >= level
    ) {
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
    const { units, round } = get();
    const onBoard = units.filter((u) => u.placement.kind === "board");
    if (onBoard.length === 0) return;

    const playerFighters: Fighter[] = onBoard.map((u) => {
      const def = CREATURES[u.defId];
      const s = statsFor(def, u.star);
      const p = u.placement as { col: number; row: number };
      return {
        uid: u.uid,
        defId: u.defId,
        star: u.star,
        team: "player",
        attribute: def.attribute,
        hp: s.hp,
        maxHp: s.hp,
        attack: s.attack,
        attackSpeed: s.attackSpeed,
        range: s.range,
        col: p.col,
        row: p.row,
        cooldown: 0,
        moving: false,
        targetUid: null,
      };
    });

    applySynergies(playerFighters, onBoard);

    set({
      phase: "battle",
      result: null,
      boardSnapshot: units,
      fighters: [...playerFighters, ...makeEnemyWave(round)],
      tick: 0,
    });
  },

  stepBattle: (dt) => {
    const state = get();
    if (state.phase !== "battle") return;
    const fighters = state.fighters;

    const dist = (a: Fighter, b: Fighter) => Math.hypot(a.col - b.col, a.row - b.row);

    for (const f of fighters) {
      if (f.hp <= 0) continue;
      f.cooldown = Math.max(0, f.cooldown - dt);

      let target = fighters.find((t) => t.uid === f.targetUid && t.hp > 0);
      if (!target) {
        let best: Fighter | null = null;
        let bestD = Infinity;
        for (const t of fighters) {
          if (t.team === f.team || t.hp <= 0) continue;
          const d = dist(f, t);
          if (d < bestD) {
            bestD = d;
            best = t;
          }
        }
        target = best ?? undefined;
        f.targetUid = best?.uid ?? null;
      }
      if (!target) continue;

      const d = dist(f, target);
      if (d <= f.range + 0.05) {
        f.moving = false;
        if (f.cooldown <= 0) {
          const mult = attributeMultiplier(f.attribute, target.attribute);
          target.hp -= f.attack * mult;
          f.cooldown = 1 / f.attackSpeed;
        }
      } else {
        f.moving = true;
        const step = MOVE_SPEED * dt;
        const ux = (target.col - f.col) / d;
        const uy = (target.row - f.row) / d;
        f.col += ux * Math.min(step, d);
        f.row += uy * Math.min(step, d);
      }
    }

    const alive = fighters.filter((f) => f.hp > 0);
    const playersLeft = alive.some((f) => f.team === "player");
    const enemiesLeft = alive.some((f) => f.team === "enemy");

    if (!playersLeft || !enemiesLeft) {
      const win = playersLeft;
      const survivingEnemies = alive.filter((f) => f.team === "enemy").length;
      const damage = win ? 0 : 4 + survivingEnemies * 2;
      const health = Math.max(0, state.health - damage);
      const streak = win
        ? state.streak >= 0
          ? state.streak + 1
          : 1
        : state.streak <= 0
          ? state.streak - 1
          : -1;
      set({
        phase: "result",
        result: win ? "win" : "lose",
        fighters: alive,
        streak,
        health,
        lastDamage: damage,
        gameOver: health <= 0,
        tick: state.tick + 1,
      });
    } else {
      set({ fighters: alive, tick: state.tick + 1 });
    }
  },

  toPrep: () => {
    const state = get();
    if (state.gameOver) return;
    const income = BASE_INCOME + interest(state.gold) + streakBonus(state.streak);
    const leveled = gainXp(state.level, state.xp, 1); // passive XP each round
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

  reset: () => {
    set({ ...initialState() });
  },
}));

// Dev convenience: poke the store from the browser console (balancing, debugging).
if (import.meta.env.DEV) {
  (window as unknown as { game: typeof useGame }).game = useGame;
}
