import type { Fighter } from "./types";
import { FORMS, PLAYABLE_IDS } from "./creatures";
import { makeFighter } from "./battle";
import { COLS } from "./board";

/**
 * Solo-run difficulty and economy knobs in one place. Tuned with the full-run bot
 * simulator (`npm run runsim`), which plays complete runs through the real store.
 */
export const ECONOMY = {
  baseIncome: 5,
  /** extra gold for winning a round */
  winGold: 1,
  /** free XP every round */
  passiveXp: 2,
  xpCost: 4,
  xpPerBuy: 4,
};

/** Shop odds by player level: chance of each rookie cost tier (1–4), like TFT's
 *  level-based odds — low levels see cheap rookies, high levels the expensive lines. */
export const SHOP_ODDS: Record<number, [number, number, number, number]> = {
  3: [45, 40, 13, 2],
  4: [38, 40, 18, 4],
  5: [30, 40, 24, 6],
  6: [24, 36, 30, 10],
  7: [18, 32, 34, 16],
  8: [14, 28, 36, 22],
};

export const WAVES = {
  /** enemy HP +x per round (rounds 1..15), then +endlessRamp per round beyond 15 */
  hpRamp: 0.02,
  endlessRamp: 0.06,
  /** non-boss rounds: [rookies, champions, megas] — mixes follow what a player can
   *  field on the economy (Megas take 9 rookies), endless ramps into all-Mega waves */
  table: {
    1: [3, 0, 0],
    2: [3, 0, 0],
    3: [4, 0, 0],
    4: [4, 0, 0],
    6: [2, 2, 0],
    7: [2, 3, 0],
    8: [1, 4, 0],
    9: [1, 4, 0],
    11: [1, 5, 0],
    12: [0, 6, 0],
    13: [0, 6, 0],
    14: [0, 5, 1],
    16: [0, 4, 3],
    17: [0, 3, 4],
    18: [0, 2, 5],
    19: [0, 1, 6],
  } as Record<number, [number, number, number]>,
  endless: [0, 0, 7] as [number, number, number],
  /** boss multipliers by tier (rounds 5, 10, 15, endless) and the stage of its adds */
  boss: [
    { hp: 3.4, atk: 1.35, adds: 1 },
    { hp: 2.4, atk: 1.2, adds: 2 },
    { hp: 2.5, atk: 1.25, adds: 2 },
    { hp: 4.2, atk: 1.6, adds: 3 },
  ] as { hp: number; atk: number; adds: 1 | 2 | 3 }[],
};

// Every 5th round is a BOSS: one oversized villain with big HP (+2 adds) and a
// guaranteed item reward.
const BOSS_IDS: Record<number, string> = { 5: "skullsatamon", 10: "machinedramon", 15: "diaboromon" };
const ENDLESS_BOSSES = ["gankoomon", "zeed", "imperialdramon", "gracenovamon", "alphamon", "machinedramon", "diaboromon"];

export const isBossRound = (round: number) => round % 5 === 0;

function bossIdFor(round: number): string {
  return BOSS_IDS[round] ?? ENDLESS_BOSSES[(round / 5) % ENDLESS_BOSSES.length];
}

type Mix = [number, number, number];
type BossSpec = { id: string; hp: number; atk: number; adds: 1 | 2 | 3; addCount: number };

/** Deterministic wave from a round number: the same round always fields the same
 *  forms in the same cells (both VS clients rely on this). `prefix` keeps uids apart. */
function buildWave(round: number, hpScale: number, boss: BossSpec | null, mix: Mix, prefix = "e"): Fighter[] {
  const pick = (stage: 1 | 2 | 3, i: number) => {
    const pool = PLAYABLE_IDS.filter((id) => FORMS[id].stage === stage);
    return pool[(round * 3 + i * 5) % pool.length];
  };
  const at = (i: number) => ({ col: i % COLS, row: 5 - Math.floor(i / COLS) });

  if (boss) {
    const b = makeFighter(boss.id, prefix === "e" ? "boss" : `${prefix}boss`, "enemy", 2, 4, hpScale);
    // one huge focused threat instead of a wall: big HP, harder hits, boss flag
    b.hp = Math.round(b.hp * boss.hp);
    b.maxHp = b.hp;
    b.attack = Math.round(b.attack * boss.atk);
    b.boss = true;
    const adds = Array.from({ length: boss.addCount }, (_, i) => {
      const p = at(i * 2 + 1); // flank the boss
      return makeFighter(pick(boss.adds, i), `${prefix}${i}`, "enemy", p.col, p.row, hpScale * 0.9);
    });
    return [b, ...adds];
  }

  const [rookies, champs, megas] = mix;
  // megas first (front-left), then champions, then rookies
  const stages: (1 | 2 | 3)[] = [
    ...Array<3>(megas).fill(3),
    ...Array<2>(champs).fill(2),
    ...Array<1>(rookies).fill(1),
  ];
  return stages.map((stage, i) => {
    const p = at(i);
    return makeFighter(pick(stage, i), `${prefix}${i}`, "enemy", p.col, p.row, hpScale);
  });
}

export function makeEnemyWave(round: number): Fighter[] {
  const hpScale = 1 + (round - 1) * WAVES.hpRamp + (round > 15 ? (round - 15) * WAVES.endlessRamp : 0);
  if (isBossRound(round)) {
    const b = WAVES.boss[round <= 5 ? 0 : round <= 10 ? 1 : round <= 15 ? 2 : 3];
    return buildWave(round, hpScale, { id: bossIdFor(round), ...b, addCount: round > 15 ? 3 : 2 }, [0, 0, 0]);
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
  /** wild-Digimon rounds: [rookies, champions, megas]; later stages repeat the last.
   *  Tuned on 600 bot runs' boards (`npm run runsim -- dumpBoards=…`): a typical board wins
   *  ~90% — loot rounds, but a weak board can trip. */
  wild: { 1: [2, 0, 0], 2: [3, 0, 0], 5: [3, 1, 0], 15: [1, 5, 0], 25: [0, 4, 2], 35: [0, 3, 4] } as Record<number, Mix>,
  /** bosses of rounds 10, 20, 30, 40+ — a real check, getting harder: a typical board
   *  beats them ~68% / 63% / 57% / 52% of the time (same tuning run) */
  bosses: [
    { id: "skullsatamon", hp: 4.4, atk: 1.8, adds: 2, addCount: 2 },
    { id: "machinedramon", hp: 2.6, atk: 1.45, adds: 3, addCount: 2 },
    { id: "zeed", hp: 2.9, atk: 1.3, adds: 3, addCount: 2 },
    { id: "gracenovamon", hp: 3.2, atk: 1.45, adds: 3, addCount: 3 },
  ] as BossSpec[],
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

/** The wild / boss wave of a VS PvE round — identical on both clients. */
export function makeVsWave(round: number, prefix = "W"): Fighter[] {
  const hpScale = round <= 2 ? 0.75 + round * 0.05 : 1 + (round - 1) * WAVES.hpRamp;
  if (vsRoundKind(round) === "boss") {
    const tier = Math.min(VS.bosses.length - 1, round / (VS.stageLength * 2) - 1);
    return buildWave(round, hpScale, VS.bosses[tier], [0, 0, 0], prefix);
  }
  const keys = Object.keys(VS.wild).map(Number).sort((a, b) => a - b);
  const key = [...keys].reverse().find((k) => k <= round) ?? keys[0];
  return buildWave(round, hpScale, null, VS.wild[key], prefix);
}
