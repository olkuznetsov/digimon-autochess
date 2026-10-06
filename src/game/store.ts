import { create } from "zustand";
import type { Fighter, PendingEvolution, Phase, Placement, Unit } from "./types";
import { FORMS, PLAYABLE_IDS, ROOKIE_IDS, babyOf, costOf, mergeParts, sellValue } from "./creatures";
import { makeFighter, stepCombat, SIM_DT, type CombatEvent } from "./battle";
import { applySynergies } from "./synergies";
import { BASE_ITEM_IDS, DIGIVICE, FUSED_ITEM_IDS, MAX_ITEMS, RARE_ITEM_IDS, fuseResult } from "./items";
import { DIFFICULTY, ECONOMY, VS, isBossRound, isDifficulty, makeEnemyWave, vsRoundKind, type Difficulty } from "./tuning";
import {
  carouselEnd,
  carouselPick,
  fullPool,
  opponentOf,
  type LobbyFight,
  type LobbySnapshot,
  type Outcome,
} from "./lobby";
import { duelFighters, ghostFighters, ladderFighters, outcomesHash, pveFighters, roundOutcomes, FIGHT_STEPS, LADDER_STEPS } from "./vsFights";
import { augmentOffer, isAugmentRound, MAX_AUGMENTS } from "./augments";
import { MAX_LEVEL } from "./xpView";
import { sfx, battleSfx } from "../audio/sfx";
import { net } from "../net/bus";
import { submitScore } from "../net/leaderboard";
import { discover, discovery, gainXp, interest, rollShop, shopPool, streakBonus } from "./shop";
import { resolveEvolutions } from "./merge";
import { autoFill, boardCap, boardCount, firstEmptyBench, mirrorCol, mirrorRow, samePlace, wireBoard } from "./placement";
import type { Fx, GameState, MeterRow, PvpState } from "./storeTypes";

// what the rest of the game takes from here
export { boardCap, wireBoard } from "./placement";
export type { Fx, MeterRow, PvpBoardUnit, PvpState } from "./storeTypes";

const START_LEVEL = 2;
const START_HEALTH = 100;


let uidCounter = 0;
const nextUid = () => `u${uidCounter++}`;

let fxCounter = 0;
const FX_TTL = 1.0; // seconds an effect stays in the list

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

/** Your side of a battle, best damage first (the live meter and the last battle's). */
export function meterRows(s: { fighters: Fighter[]; corpses: Fighter[]; meter: Record<string, { dealt: number; taken: number }>; viewFlip: boolean }): MeterRow[] {
  const mine = s.viewFlip ? "enemy" : "player";
  return [...s.fighters, ...s.corpses]
    .filter((f) => f.team === mine)
    .map((f) => ({ uid: f.uid, formId: f.formId, dead: f.hp <= 0, ...(s.meter[f.uid] ?? { dealt: 0, taken: 0 }) }))
    .sort((a, b) => b.dealt - a.dealt);
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

/** The difficulty the next new run starts at (the menu sets it; remembered). */
export function preferredDifficulty(): Difficulty {
  try {
    const d = localStorage.getItem("dac-difficulty");
    return isDifficulty(d) ? d : "normal";
  } catch {
    return "normal";
  }
}
/** Whether the next new run is a Primary Village one (the menu sets it; remembered). */
export function preferredVillage(): boolean {
  try {
    return localStorage.getItem("dac-village") === "1";
  } catch {
    return false;
  }
}
export function setPreferredVillage(on: boolean) {
  try {
    localStorage.setItem("dac-village", on ? "1" : "0");
  } catch {
    /* not remembered */
  }
}

export function setPreferredDifficulty(d: Difficulty) {
  try {
    localStorage.setItem("dac-difficulty", d);
  } catch {
    /* not remembered: still used for this visit's next run */
  }
}

function initialState() {
  return {
    gold: ECONOMY.startGold,
    level: START_LEVEL,
    xp: 0,
    health: START_HEALTH,
    round: 1,
    runSeed: newRunSeed(),
    difficulty: preferredDifficulty(),
    village: preferredVillage(),
    streak: 0,
    gameOver: false,
    shop: rollShop(START_LEVEL, []),
    discovered: [] as string[],
    discoveryFlash: null as { ids: string[]; key: number } | null,
    units: [] as Unit[],
    inventory: [] as string[],
    selectedItem: null as string | null,
    inspected: null as string | null,
    evoFlash: null as { from: string; to: string; uid: string; key: number; star?: number } | null,
    pendingEvolution: null as PendingEvolution | null,
    phase: "prep" as Phase,
    result: null as "win" | "lose" | null,
    lastDamage: 0,
    fighters: [] as Fighter[],
    corpses: [] as Fighter[],
    battleSeq: 0,
    meter: {} as Record<string, { dealt: number; taken: number }>,
    lastMeter: null as MeterRow[] | null,
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
    ghost: null as { name: string; partner?: string | null } | null,
  };
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
    const resolved = resolveEvolutions([...units, newUnit]);
    // ...but not a copy that merges with nothing and would stand nowhere (a Mega whose
    // copies hold different stars)
    if (slot === null && resolved.units.some((u) => u.uid === newUnit.uid) && !resolved.pending?.consume.includes(newUnit.uid))
      return;
    const newShop = [...shop];
    newShop[shopIndex] = "";
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
    const copies = units.filter((u) => consumed.has(u.uid));
    // never from fewer than three (the choice can be tucked away while the board stays live)
    if (copies.length < consumed.size) {
      set({ pendingEvolution: null });
      return;
    }
    const pooled = copies.flatMap((u) => u.items ?? []);
    const remaining = units.filter((u) => !consumed.has(u.uid));
    const evolvedUid = nextUid();
    const parts = mergeParts(copies);
    // where the kept copy stands now: it may have moved while the choice was tucked away
    const placement = copies.find((u) => u.uid === pendingEvolution.consume[0])?.placement ?? pendingEvolution.placement;
    remaining.push({ uid: evolvedUid, formId, placement, items: pooled.slice(0, MAX_ITEMS), parts });
    const resolved = resolveEvolutions(remaining);
    sfx.evolve();
    const last = resolved.evolved[resolved.evolved.length - 1];
    const flash = last ?? { from: pendingEvolution.fromFormId, to: formId, uid: evolvedUid };
    set({
      units: resolved.units,
      ...discovery(get().discovered, resolved.units),
      pendingEvolution: resolved.pending,
      inventory: [...inventory, ...pooled.slice(MAX_ITEMS), ...resolved.spill],
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
    const { units, gold, inventory, phase, pendingEvolution } = get();
    if (phase !== "prep") return;
    // a copy waiting on the evolution choice is spoken for
    if (pendingEvolution?.consume.includes(uid)) return;
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
    // a Digivice works from the tray — nobody needs to hold it
    if (!selectedItem || selectedItem === DIGIVICE) return;
    const unit = units.find((u) => u.uid === uid);
    if (!unit) return;
    const held = unit.items ?? [];
    // a base item onto a Digimon holding a base item fuses on the spot (TFT-style)
    const partner = held.findIndex((it) => fuseResult(it, selectedItem) !== null);
    if (partner < 0 && held.length >= MAX_ITEMS) return;
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
    const { units, level, inventory } = get();
    const moving = units.find((u) => u.uid === uid);
    if (!moving) return;

    const occupant = units.find((u) => u.uid !== uid && samePlace(u.placement, target));

    if (target.kind === "board" && moving.placement.kind === "bench" && !occupant && boardCount(units) >= boardCap(units, level, inventory)) {
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
    const { round, runSeed, difficulty, pendingEvolution } = get();
    if (pendingEvolution) return;
    // empty board slots take bench units, as in Teamfight Tactics
    const units = autoFill(get().units, get().level, get().inventory);
    const onBoard = units.filter((u) => u.placement.kind === "board");
    if (onBoard.length === 0) return;

    const playerFighters: Fighter[] = onBoard.map((u) => {
      const p = u.placement as { col: number; row: number };
      const f = makeFighter(u.formId, u.uid, "player", p.col, p.row, 1, u.items ?? [], u.star ?? 1);
      // Primary Village: when it falls, its line's baby hatches where it stood
      if (get().village) {
        const baby = makeFighter(babyOf(u.formId), `${u.uid}~`, "player", p.col, p.row);
        f.rebirth = { formId: baby.formId, maxHp: baby.maxHp, attack: baby.attack, hatch: true };
      }
      return f;
    });

    applySynergies(playerFighters, onBoard);
    const enemies = makeEnemyWave(round, runSeed, difficulty);
    // Primary Village takes in the wild ones too — a boss keeps its own second phase, and the
    // data-eaters (no line to hatch from) stay gone
    if (get().village)
      for (const e of enemies) {
        const root = babyOf(e.formId);
        if (e.rebirth || (FORMS[e.formId].bossOnly && root === e.formId)) continue;
        const baby = makeFighter(root, `${e.uid}~`, "enemy", e.col, e.row);
        e.rebirth = { formId: baby.formId, maxHp: baby.maxHp, attack: baby.attack, hatch: true };
      }
    if (isBossRound(round)) sfx.bossIntro();
    else sfx.battleStart();

    set({
      phase: "battle",
      battleSeq: get().battleSeq + 1,
      meter: {},
      result: null,
      viewFlip: false,
      units,
      boardSnapshot: units,
      fighters: [...playerFighters, ...enemies],
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
    // a VS fight still undecided after FIGHT_STEPS is a draw, as in everyone's simulation; a
    // ladder fight after LADDER_STEPS is lost, as the worker rates it
    const stalemate = (!!state.pvp?.fight && state.tick + 1 >= FIGHT_STEPS) || (!!state.ghost && state.tick + 1 >= LADDER_STEPS);

    if (!playersLeft || !enemiesLeft || stalemate) {
      const win = playersLeft && !enemiesLeft;
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
      const damage = win ? 0 : Math.round((4 + survivingEnemies * 2) * DIFFICULTY[state.difficulty].damage);
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
        if (state.difficulty !== "easy" && !state.village) submitScore({ best: state.round, board: wireBoard(state.boardSnapshot ?? state.units) });
      } else if (win && state.round >= 15 && state.difficulty !== "easy" && !state.village) {
        // run complete (and endless milestones) — post the winning board (an easy run stays off the board)
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
    const last = meterRows(state);
    set({
      phase: "prep",
      result: null,
      lastMeter: last.length ? last : state.lastMeter,
      fighters: [],
      corpses: [],
      fx: [],
      boardSnapshot: null,
      units: state.boardSnapshot ?? state.units,
      gold: state.gold + income,
      round: state.round + 1,
      level: leveled.level,
      xp: leveled.xp,
      // a lock keeps the shop for one round, then lets go (lock it again to keep it longer)
      shop: state.shopLocked ? state.shop : rollShop(leveled.level, state.discovered, shopPool(state)),
      shopLocked: false,
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
    // empty board slots take bench units, as in Teamfight Tactics
    const filled = autoFill(units, get().level, get().inventory);
    if (filled !== units) set({ units: filled });
    const board = wireBoard(filled);
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
  ghostFight: (board, name, partner = null) => {
    const state = get();
    if (state.phase !== "prep" || state.pvp || state.pendingEvolution) return;
    const mine = wireBoard(state.units);
    if (mine.length === 0 || board.length === 0) return;

    // built exactly as the worker builds it to rate the fight (vsFights.ts)
    const fighters = ladderFighters(mine, board);

    sfx.battleStart();
    set({
      phase: "battle",
      battleSeq: get().battleSeq + 1,
      meter: {},
      ghost: { name, partner },
      viewFlip: false,
      result: null,
      boardSnapshot: state.units,
      fighters,
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
        gold: s.gold, level: s.level, xp: s.xp, health: s.health, round: s.round, runSeed: s.runSeed, difficulty: s.difficulty, village: s.village,
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
      // a run saved before difficulties was a normal one
      difficulty: isDifficulty(d.difficulty) ? d.difficulty : "normal",
      village: d.village === true,
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
