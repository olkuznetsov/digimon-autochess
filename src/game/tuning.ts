import type { Fighter } from "./types";
import { FORMS, ALL_FORM_IDS } from "./creatures";
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
    { hp: 2.6, atk: 1.25, adds: 2 },
    { hp: 4.2, atk: 1.6, adds: 3 },
  ] as { hp: number; atk: number; adds: 1 | 2 | 3 }[],
};

// Every 5th round is a BOSS: one oversized villain with big HP (+2 adds) and a
// guaranteed item reward.
const BOSS_IDS: Record<number, string> = { 5: "skullsatamon", 10: "machinedramon", 15: "diaboromon" };
const ENDLESS_BOSSES = ["gankoomon", "imperialdramon", "alphamon", "machinedramon", "diaboromon"];

export const isBossRound = (round: number) => round % 5 === 0;

function bossIdFor(round: number): string {
  return BOSS_IDS[round] ?? ENDLESS_BOSSES[(round / 5) % ENDLESS_BOSSES.length];
}

export function makeEnemyWave(round: number): Fighter[] {
  const hpScale = 1 + (round - 1) * WAVES.hpRamp + (round > 15 ? (round - 15) * WAVES.endlessRamp : 0);
  const pick = (stage: 1 | 2 | 3, i: number) => {
    const pool = ALL_FORM_IDS.filter((id) => FORMS[id].stage === stage);
    return pool[(round * 3 + i * 5) % pool.length];
  };
  const at = (i: number) => ({ col: i % COLS, row: 5 - Math.floor(i / COLS) });

  if (isBossRound(round)) {
    const b = WAVES.boss[round <= 5 ? 0 : round <= 10 ? 1 : round <= 15 ? 2 : 3];
    const boss = makeFighter(bossIdFor(round), "boss", "enemy", 2, 4, hpScale);
    // one huge focused threat instead of a wall: big HP, harder hits, boss flag
    boss.hp = Math.round(boss.hp * b.hp);
    boss.maxHp = boss.hp;
    boss.attack = Math.round(boss.attack * b.atk);
    boss.boss = true;
    const addCount = round > 15 ? 3 : 2;
    const adds = Array.from({ length: addCount }, (_, i) => {
      const p = at(i * 2 + 1); // flank the boss
      return makeFighter(pick(b.adds, i), `e${i}`, "enemy", p.col, p.row, hpScale * 0.9);
    });
    return [boss, ...adds];
  }

  const [rookies, champs, megas] = WAVES.table[round] ?? WAVES.endless;
  // megas first (front-left), then champions, then rookies — same layout as before
  const stages: (1 | 2 | 3)[] = [
    ...Array<3>(megas).fill(3),
    ...Array<2>(champs).fill(2),
    ...Array<1>(rookies).fill(1),
  ];
  return stages.map((stage, i) => {
    const p = at(i);
    return makeFighter(pick(stage, i), `e${i}`, "enemy", p.col, p.row, hpScale);
  });
}
