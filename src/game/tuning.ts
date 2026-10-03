import type { Fighter, Stage } from "./types";
import { FORMS, PLAYABLE_IDS, WILD_IDS } from "./creatures";
import { makeFighter } from "./battle";
import { COLS, ROWS } from "./board";

/**
 * Solo-run difficulty and economy knobs in one place. Tuned with the full-run bot
 * simulator (`npm run runsim`), which plays complete runs through the real store.
 */
/** Since the roster grew to 24 lines (Oct 2026) the copies of any one line turn up about
 *  half as often; more gold and 1-gold rerolls keep evolutions coming (600-run sims:
 *  each boss beaten by about half the runs, as before) and let fans dig for favourites. */
export const ECONOMY = {
  /** gold at the start of a run or match */
  startGold: 10,
  baseIncome: 7,
  /** extra gold for winning a round */
  winGold: 1,
  /** free XP every round */
  passiveXp: 2,
  xpCost: 4,
  xpPerBuy: 4,
  /** a fresh shop */
  rerollCost: 1,
};

/** Shop odds by player level: the chance of each tier — the stage, Fresh 1 … Mega 5 —
 *  like TFT's level-based odds. Tiers 4 and 5 only ever offer what the player has
 *  raised this game (discovery); with nothing discovered there, the slot rolls again. */
export const SHOP_ODDS: Record<number, [number, number, number, number, number]> = {
  1: [100, 0, 0, 0, 0],
  2: [65, 35, 0, 0, 0],
  3: [35, 45, 20, 0, 0],
  4: [15, 40, 45, 0, 0],
  5: [5, 30, 65, 0, 0],
  6: [0, 20, 70, 10, 0],
  7: [0, 15, 65, 19, 1],
  8: [0, 10, 58, 27, 5],
  9: [0, 5, 50, 33, 12],
  10: [0, 0, 40, 38, 22],
};

export const WAVES = {
  /** enemy HP +x per round (rounds 1..15), then +endlessRamp per round beyond 15 */
  hpRamp: 0.02,
  endlessRamp: 0.06,
  /** non-boss rounds: how many of each stage [Fresh, In-Training, Rookie, Champion, Mega]
   *  — mixes follow what a player can field on the economy, endless ramps into all-Mega
   *  waves */
  table: {
    1: [2, 0, 0, 0, 0],
    2: [1, 2, 0, 0, 0],
    3: [0, 3, 1, 0, 0],
    4: [0, 2, 2, 0, 0],
    6: [0, 1, 3, 0, 0],
    7: [0, 0, 4, 0, 0],
    8: [0, 1, 4, 0, 0],
    9: [0, 0, 4, 1, 0],
    11: [0, 0, 2, 3, 0],
    12: [0, 0, 2, 4, 0],
    13: [0, 0, 1, 3, 1],
    14: [0, 0, 1, 4, 1],
    16: [0, 0, 0, 5, 3],
    17: [0, 0, 0, 4, 4],
    18: [0, 0, 0, 3, 5],
    19: [0, 0, 0, 2, 6],
  } as Record<number, Mix>,
  endless: [0, 0, 0, 0, 7] as Mix,
  /** bosses of rounds 5, 10 and 15 (multipliers and the stage of the adds): a run meets
   *  one candidate per round, picked by its seed. Candidates are tuned to the same pass
   *  rate on the same 600 bot boards (`npm run runsim` prints "boss candidates"). */
  bosses: [
    [{ id: "skullsatamon", hp: 1.63, atk: 1.0, adds: 2 }],
    [
      { id: "machinedramon", hp: 1.23, atk: 0.83, adds: 3 },
      { id: "mitamamon", hp: 1.1, atk: 0.61, adds: 3 },
    ],
    [
      { id: "diaboromon", hp: 3.05, atk: 1.4, adds: 4 },
      { id: "apollomon", hp: 3.38, atk: 1.1, adds: 4 },
    ],
  ] as Omit<BossSpec, "addCount">[][],
  /** endless mode: every 5th round the next of these, all with the same multipliers */
  endlessBosses: ["gankoomon", "zeed", "apollomon", "imperialdramon", "gracenovamon", "mitamamon", "alphamon", "machinedramon", "diaboromon"],
  endlessBoss: { hp: 4.2, atk: 1.6, adds: 5 } as { hp: number; atk: number; adds: Stage },
};

export const isBossRound = (round: number) => round % 5 === 0;

/** how many of each stage a wave fields: [Fresh, In-Training, Rookie, Champion, Mega] */
type Mix = [number, number, number, number, number];
/** `adds`: the stage of the minions flanking the boss */
type BossSpec = { id: string; hp: number; atk: number; adds: Stage; addCount: number };

/** One of a boss round's candidates: the first for seed 0 (saves and rooms from before
 *  there was a choice), otherwise spread by the seed — per round, so a run's bosses vary
 *  independently. */
function pickBoss<T>(candidates: T[], seed: number, round: number): T {
  if (!seed || candidates.length === 1) return candidates[0];
  let h = (seed ^ Math.imul(round, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return candidates[((h ^ (h >>> 16)) >>> 0) % candidates.length];
}

const STAGES = [1, 2, 3, 4, 5] as const;
const byStage = (ids: string[]) => STAGES.map((stage) => ids.filter((id) => FORMS[id].stage === stage));
/** Bosses bring their minions from the roster. */
const ROSTER = byStage(PLAYABLE_IDS);
/** Waves draw from the roster plus the wild Digimon — twice, so they turn up often
 *  (a wild pack can bring two of a kind). */
const WAVE_POOL = ROSTER.map((roster, i) => [...roster, ...byStage(WILD_IDS)[i], ...byStage(WILD_IDS)[i]]);
/** the stride between a wave's picks: coprime with the pool, so a wave doesn't repeat
 *  the same few forms */
const WAVE_STEP = WAVE_POOL.map((pool) => [5, 7, 11, 13].find((k) => pool.length % k !== 0) ?? 1);

/** Deterministic wave from a round number: the same round always fields the same
 *  forms in the same cells (both VS clients rely on this). `prefix` keeps uids apart. */
function buildWave(round: number, hpScale: number, boss: BossSpec | null, mix: Mix, prefix = "e"): Fighter[] {
  const pick = (stage: Stage, i: number) => {
    const pool = WAVE_POOL[stage - 1];
    return pool[(round * 3 + i * WAVE_STEP[stage - 1]) % pool.length];
  };
  const minion = (stage: Stage, i: number) => ROSTER[stage - 1][(round * 3 + i * 5) % ROSTER[stage - 1].length];
  const at = (i: number) => ({ col: i % COLS, row: ROWS - 1 - Math.floor(i / COLS) });

  if (boss) {
    // the boss stands mid-board on the enemy's second row
    const b = makeFighter(boss.id, prefix === "e" ? "boss" : `${prefix}boss`, "enemy", Math.floor(COLS / 2), ROWS / 2 + 1, hpScale);
    // one huge focused threat instead of a wall: big HP, harder hits, boss flag
    b.hp = Math.round(b.hp * boss.hp);
    b.maxHp = b.hp;
    b.attack = Math.round(b.attack * boss.atk);
    b.boss = true;
    const adds = Array.from({ length: boss.addCount }, (_, i) => {
      const p = at(i * 2 + 1); // flank the boss
      return makeFighter(minion(boss.adds, i), `${prefix}${i}`, "enemy", p.col, p.row, hpScale * 0.9);
    });
    return [b, ...adds];
  }

  // megas first (front-left), then champions, rookies and the babies
  const stages = [...STAGES].reverse().flatMap((stage) => Array<Stage>(mix[stage - 1]).fill(stage));
  return stages.map((stage, i) => {
    const p = at(i);
    return makeFighter(pick(stage, i), `${prefix}${i}`, "enemy", p.col, p.row, hpScale);
  });
}

/** A solo round's enemies. `seed` is the run's: it picks the bosses (0 = the classic ones). */
export function makeEnemyWave(round: number, seed = 0): Fighter[] {
  const hpScale = 1 + (round - 1) * WAVES.hpRamp + (round > 15 ? (round - 15) * WAVES.endlessRamp : 0);
  if (isBossRound(round)) {
    const boss =
      round <= 15
        ? { ...pickBoss(WAVES.bosses[round / 5 - 1], seed, round), addCount: 2 }
        : { id: WAVES.endlessBosses[(round / 5) % WAVES.endlessBosses.length], ...WAVES.endlessBoss, addCount: 3 };
    return buildWave(round, hpScale, boss, [0, 0, 0, 0, 0]);
  }
  return buildWave(round, hpScale, null, WAVES.table[round] ?? WAVES.endless);
}

// ---------- VS (1v1): Teamfight Tactics' round rhythm ----------
// Stages of 5 rounds: fights against other players, an item draft (the carousel)
// on the 3rd round of every stage, wild Digimon on the 5th and a boss on every
// 10th; the first two rounds are easy wild fights so everyone starts with loot.

export type VsRound = "pvp" | "pve" | "boss";

export const VS = {
  stageLength: 5,
  /** damage for losing a round, by stage (then +8 per stage), plus 1 per surviving enemy */
  stageDamage: [2, 5, 9, 14, 20, 28],
  /** planning time before an automatic ready */
  planSeconds: 40,
  planSecondsTouch: 50,
  /** wild-Digimon rounds: [Fresh, In-Training, Rookie, Champion, Mega]; later stages repeat the last.
   *  Tuned on 600 bot runs' boards (`npm run runsim -- maxRound=45 dumpBoards=…`): a typical board
   *  wins ~86–93% — loot rounds, but a weak board can trip. */
  wild: {
    1: [2, 0, 0, 0, 0],
    2: [1, 2, 0, 0, 0],
    5: [0, 1, 2, 0, 0],
    15: [0, 0, 1, 5, 0],
    25: [0, 0, 0, 3, 4],
    35: [0, 0, 0, 3, 5],
  } as Record<number, Mix>,
  /** bosses of rounds 10, 20, 30, 40+ — a real check, getting harder: a typical board
   *  beats them ~67% / 60% / 57% / 53% of the time (600 bot boards on the tier rules and
   *  the 7 × 4 board, Oct 2026). A match meets one candidate per round, picked by the room's variant;
   *  candidates match. */
  bosses: [
    [{ id: "skullsatamon", hp: 2.45, atk: 1.32, adds: 3, addCount: 2 }],
    [
      { id: "machinedramon", hp: 5.3, atk: 2.15, adds: 5, addCount: 2 },
      { id: "mitamamon", hp: 4.95, atk: 1.6, adds: 5, addCount: 2 },
    ],
    [
      { id: "zeed", hp: 4.85, atk: 1.72, adds: 5, addCount: 2 },
      { id: "apollomon", hp: 4.6, atk: 1.85, adds: 5, addCount: 2 },
    ],
    [{ id: "gracenovamon", hp: 3.3, atk: 1.56, adds: 5, addCount: 3 }],
  ] as BossSpec[][],
};

export function vsRoundKind(round: number): VsRound {
  if (round <= 2) return "pve";
  if (round % (VS.stageLength * 2) === 0) return "boss";
  if (round % VS.stageLength === 0) return "pve";
  return "pvp";
}

/** The 3rd round of every stage opens with the carousel (an item draft, lowest HP first). */
export const isCarouselRound = (round: number) => round % VS.stageLength === 3;

export function vsStageDamage(round: number): number {
  const stage = Math.ceil(round / VS.stageLength);
  const t = VS.stageDamage;
  return stage <= t.length ? t[stage - 1] : t[t.length - 1] + (stage - t.length) * 8;
}

/** The wild / boss wave of a VS PvE round — identical on every client. `variant` is the
 *  room's per-match number: it picks the bosses (0 = the classic ones). */
export function makeVsWave(round: number, prefix = "W", variant = 0): Fighter[] {
  const hpScale = round <= 2 ? 0.75 + round * 0.05 : 1 + (round - 1) * WAVES.hpRamp;
  if (vsRoundKind(round) === "boss") {
    const tier = Math.min(VS.bosses.length - 1, round / (VS.stageLength * 2) - 1);
    return buildWave(round, hpScale, pickBoss(VS.bosses[tier], variant, round), [0, 0, 0, 0, 0], prefix);
  }
  const keys = Object.keys(VS.wild).map(Number).sort((a, b) => a - b);
  const key = [...keys].reverse().find((k) => k <= round) ?? keys[0];
  return buildWave(round, hpScale, null, VS.wild[key], prefix);
}
