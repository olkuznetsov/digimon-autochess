import { create } from "zustand";
import type { Fighter, PendingEvolution, Phase, Placement, Unit } from "./types";
import { FORMS, ROOKIE_IDS, ALL_FORM_IDS, sellValue } from "./creatures";
import { makeFighter, stepCombat, type CombatEvent } from "./battle";
import { applySynergies } from "./synergies";
import { ITEM_IDS } from "./items";
import { XP_TO_NEXT, MAX_LEVEL } from "./xpView";
import { sfx, battleSfx } from "../audio/sfx";
import { BENCH_SLOTS, COLS } from "./board";
import { net } from "../net/bus";

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
}

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

// ---------- enemy waves & bosses ----------
// Every 5th round is a BOSS: one oversized villain with big HP (+2 adds) and a
// guaranteed item reward. Non-boss rounds ramp gently: the player needs 9 rookies
// for one Mega, so enemy Megas only start appearing (mixed in) from round 11.
const BOSS_IDS: Record<number, string> = { 5: "skullsatamon", 10: "machinedramon", 15: "diaboromon" };
const ENDLESS_BOSSES = ["gankoomon", "imperialdramon", "alphamon", "machinedramon", "diaboromon"];

export const isBossRound = (round: number) => round % 5 === 0;

function bossIdFor(round: number): string {
  return BOSS_IDS[round] ?? ENDLESS_BOSSES[(round / 5) % ENDLESS_BOSSES.length];
}

function makeEnemyWave(round: number): Fighter[] {
  // gentler global HP ramp (was 5%/round); endless (16+) accelerates again
  const hpScale = 1 + (round - 1) * 0.035 + (round > 15 ? (round - 15) * 0.06 : 0);
  const pick = (stage: 1 | 2 | 3, i: number) => {
    const pool = ALL_FORM_IDS.filter((id) => FORMS[id].stage === stage);
    return pool[(round * 3 + i * 5) % pool.length];
  };
  const at = (i: number) => ({ col: i % COLS, row: 5 - Math.floor(i / COLS) });

  if (isBossRound(round)) {
    const tier = round <= 5 ? 1 : round <= 10 ? 2 : 3;
    const boss = makeFighter(bossIdFor(round), "boss", "enemy", 2, 4, hpScale);
    // one huge focused threat instead of a wall: big HP, harder hits, boss flag
    const bossHp = tier === 1 ? 3.4 : tier === 2 ? 3.6 : 4.2;
    boss.hp = Math.round(boss.hp * bossHp);
    boss.maxHp = boss.hp;
    boss.attack = Math.round(boss.attack * (tier === 1 ? 1.35 : tier === 2 ? 1.45 : 1.6));
    boss.boss = true;
    const addStage = (tier === 1 ? 1 : tier === 2 ? 2 : 3) as 1 | 2 | 3;
    const addCount = round > 15 ? 3 : 2;
    const adds = Array.from({ length: addCount }, (_, i) => {
      const p = at(i * 2 + 1); // flank the boss
      return makeFighter(pick(addStage, i), `e${i}`, "enemy", p.col, p.row, hpScale * 0.9);
    });
    return [boss, ...adds];
  }

  // non-boss rounds: counts + stage mix tuned so a well-played run reaches 15
  //           r:  1  2  3  4  -  6  7  8  9  -  11 12 13 14
  const counts = [0, 3, 3, 4, 4, 0, 4, 5, 5, 6, 0, 6, 6, 6, 7][round] ?? 7;
  return Array.from({ length: counts }, (_, i) => {
    let stage: 1 | 2 | 3;
    if (round <= 4) stage = 1;
    else if (round <= 9) stage = i === 0 && round >= 8 ? 3 : 2; // rounds 8-9 sneak in one Mega
    else if (round <= 14) stage = i < round - 10 ? 3 : 2; // 11-14: growing Mega count
    else stage = 3; // endless
    const p = at(i);
    return makeFighter(pick(stage, i), `e${i}`, "enemy", p.col, p.row, hpScale);
  });
}

/**
 * Resolve digivolutions after a unit changes. Auto-evolves any 3-of-a-kind whose
 * form has a single branch (looping), and stops at the first 3-of-a-kind that has
 * multiple branches — returning a PendingEvolution for the player to choose.
 */
function resolveEvolutions(
  units: Unit[],
): { units: Unit[]; pending: PendingEvolution | null; evolved: { from: string; to: string }[] } {
  let current = units;
  const evolved: { from: string; to: string }[] = [];
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
        evolved.push({ from: formId, to: form.evolvesTo![0] });
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
  evoFlash: { from: string; to: string; key: number } | null;
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

  pvp: PvpState | null;

  reroll: () => void;
  buy: (shopIndex: number) => void;
  buyXp: () => void;
  chooseEvolution: (formId: string) => void;
  selectItem: (id: string | null) => void;
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

  pvpJoined: (code: string, side: "A" | "B", players: { A: string | null; B: string | null; online: string[] }) => void;
  pvpPeer: (players: { A: string | null; B: string | null; online: string[] }) => void;
  pvpReadyUp: () => void;
  pvpOppReady: () => void;
  pvpFight: (boards: Record<"A" | "B", PvpBoardUnit[]>) => void;
  pvpResult: (winner: "A" | "B" | "draw", damage: number) => void;
  pvpLeft: () => void;
  pvpQuit: () => void;
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
    evoFlash: null as { from: string; to: string; key: number } | null,
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
    pvp: null as PvpState | null,
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
    sfx.reroll();
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
    if (level >= MAX_LEVEL || gold < XP_COST) return;
    sfx.click();
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
    sfx.evolve();
    const last = resolved.evolved[resolved.evolved.length - 1];
    const flash = last ?? { from: pendingEvolution.fromFormId, to: formId };
    set({
      units: resolved.units,
      pendingEvolution: resolved.pending,
      inventory: [...inventory, ...pooled.slice(2)],
      evoFlash: { ...flash, key: Date.now() },
    });
  },

  selectItem: (id) => set({ selectedItem: id }),

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
    sfx.battleStart();

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
    for (const e of events) battleSfx(e.kind === "hit" ? (e.ranged ? "shot" : "hit") : e.kind);
    const bt = state.battleTime + dt;

    const alive = fighters.filter((fr) => fr.hp > 0);
    const playersLeft = alive.some((fr) => fr.team === "player");
    const enemiesLeft = alive.some((fr) => fr.team === "enemy");

    if (!playersLeft || !enemiesLeft) {
      const win = playersLeft;
      if (state.pvp) {
        // VS match: the HOST simulation is authoritative — it reports the result,
        // and BOTH clients apply health when the relayed message arrives.
        if (state.pvp.side === "A") {
          const winners = alive.length;
          net.send?.({
            t: "result",
            round: state.round,
            winner: win && !enemiesLeft ? "A" : enemiesLeft && !playersLeft ? "B" : "draw",
            damage: 4 + winners * 2,
          });
        }
        if (win) sfx.win();
        else sfx.lose();
        set({
          phase: "result",
          result: win ? "win" : "lose",
          fighters: alive,
          fx: [],
          battleTime: bt,
          tick: state.tick + 1,
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
          ? [...state.inventory, ITEM_IDS[Math.floor(Math.random() * ITEM_IDS.length)]]
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
      }
      set({
        phase: "result",
        result: win ? "win" : "lose",
        fighters: alive,
        fx: [],
        battleTime: bt,
        streak,
        inventory,
        gold: state.gold + (bossBonus ? 3 : 0),
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
      ...(state.pvp ? { pvp: { ...state.pvp, myReady: false, oppReady: false } } : {}),
    });
  },

  reset: () => {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    set({ ...initialState() });
  },

  // ---------- VS friend (multiplayer) ----------
  pvpJoined: (code, side, players) => {
    const other = side === "A" ? "B" : "A";
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
      },
      // a fresh match starts a fresh run for fairness
      gold: START_GOLD,
      level: START_LEVEL,
      xp: 0,
      health: START_HEALTH,
      round: 1,
      streak: 0,
      gameOver: false,
      units: [],
      inventory: [],
      shop: rollShop(),
      phase: "prep",
      result: null,
      fighters: [],
      pendingEvolution: null,
      inspected: null,
    });
  },

  pvpPeer: (players) => {
    const { pvp } = get();
    if (!pvp) return;
    const other = pvp.side === "A" ? "B" : "A";
    const nowOnline = players.online.includes(other);
    if (nowOnline && !pvp.oppOnline) sfx.buy(); // little "friend joined" pop
    set({ pvp: { ...pvp, oppName: players[other], oppOnline: nowOnline } });
  },

  pvpReadyUp: () => {
    const { pvp, units, round, pendingEvolution } = get();
    if (!pvp || pvp.myReady || pendingEvolution) return;
    const board: PvpBoardUnit[] = units
      .filter((u) => u.placement.kind === "board")
      .map((u) => {
        const p = u.placement as { col: number; row: number };
        return { uid: u.uid, formId: u.formId, col: p.col, row: p.row, items: u.items ?? [] };
      });
    if (board.length === 0) return;
    net.send?.({ t: "ready", round, board });
    sfx.click();
    set({ pvp: { ...pvp, myReady: true } });
  },

  pvpOppReady: () => {
    const { pvp } = get();
    if (pvp) set({ pvp: { ...pvp, oppReady: true } });
  },

  pvpFight: (boards) => {
    const state = get();
    const pvp = state.pvp;
    if (!pvp) return;
    const mine = boards[pvp.side] ?? [];
    const theirs = boards[pvp.side === "A" ? "B" : "A"] ?? [];

    const myFighters = mine.map((u) =>
      makeFighter(u.formId, `m_${u.uid}`, "player", u.col, u.row, 1, u.items),
    );
    applySynergies(
      myFighters,
      mine.map((u) => ({ uid: `m_${u.uid}`, formId: u.formId, placement: { kind: "board" as const, col: u.col, row: u.row }, items: u.items })),
    );
    // opponent board mirrored onto the red half
    const oppFighters = theirs.map((u) =>
      makeFighter(u.formId, `o_${u.uid}`, "enemy", COLS - 1 - u.col, 5 - u.row, 1, u.items),
    );
    applySynergies(
      oppFighters,
      theirs.map((u) => ({ uid: `o_${u.uid}`, formId: u.formId, placement: { kind: "board" as const, col: u.col, row: u.row }, items: u.items })),
    );

    sfx.battleStart();
    set({
      phase: "battle",
      result: null,
      boardSnapshot: state.units,
      fighters: [...myFighters, ...oppFighters],
      fx: [],
      battleTime: 0,
      tick: 0,
    });
  },

  pvpResult: (winner, damage) => {
    const state = get();
    const pvp = state.pvp;
    if (!pvp || pvp.matchOver) return;
    const iWon = winner === pvp.side;
    const draw = winner === "draw";
    const health = Math.max(0, state.health - (draw ? 4 : iWon ? 0 : damage));
    const oppHealth = Math.max(0, pvp.oppHealth - (draw ? 4 : iWon ? damage : 0));
    const streak = draw ? 0 : iWon ? Math.max(1, state.streak + 1) : Math.min(-1, state.streak - 1);
    const inventory =
      iWon && state.inventory.length < 8 && Math.random() < 0.55
        ? [...state.inventory, ITEM_IDS[Math.floor(Math.random() * ITEM_IDS.length)]]
        : state.inventory;
    const matchOver: PvpState["matchOver"] =
      health <= 0 && oppHealth <= 0 ? "draw" : health <= 0 ? "lose" : oppHealth <= 0 ? "win" : null;
    set({
      health,
      streak,
      inventory,
      lastDamage: iWon || draw ? 0 : damage,
      pvp: { ...pvp, oppHealth, matchOver },
    });
  },

  pvpLeft: () => {
    const { pvp } = get();
    if (!pvp) return;
    // a fled opponent forfeits (unless the match already ended)
    set({ pvp: { ...pvp, oppOnline: false, oppLeft: true, matchOver: pvp.matchOver ?? "win" } });
  },

  pvpQuit: () => {
    set({ ...initialState() });
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
        uidCounter,
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
        phase: "prep",
      });
    }
  }
} catch { /* ignore */ }

// Dev convenience: poke the store from the browser console (balancing, debugging).
if (import.meta.env.DEV) {
  (window as unknown as { game: typeof useGame; FORMS: typeof FORMS }).game = useGame;
  (window as unknown as { FORMS: typeof FORMS }).FORMS = FORMS;
}
