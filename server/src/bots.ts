import RUNS from "./bot-runs.json";
import type { BoardUnit } from "./util";
import { AUGMENTS, AUGMENT_IDS, AUGMENT_ROUNDS } from "../../src/game/augments";
import { babyOf } from "../../src/game/creatures";

/**
 * VS bots: a host fills empty seats with them. A bot plays one of the run-sim bot's real runs
 * (scripts/bot-runs.mjs → bot-runs.json): every round it locks in that run's board for the
 * round — bought, merged, levelled and itemized the way a player's grows — so a bot needs no
 * shop of its own and costs the room nothing between fights. Bots pick a combat augment on
 * augment rounds, take what the carousel leaves them, and never touch the rating.
 */

type CompactUnit = [string, number, number, string[]?, number?];
const runs = RUNS as unknown as CompactUnit[][][];

/** The names bots play under (Adventure's helpers and rivals). */
const NAMES = ["Gennai", "Jijimon", "Elecmon", "Leomon", "Centarumon", "Andromon", "Piximon", "Ogremon"];

/** What a bot is: the run it plays this match. */
export interface Bot {
  run: number;
}

/** A small deterministic hash: the same room seed gives the same bots. */
function mix(a: number, b: number): number {
  let h = (a ^ Math.imul(b + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** The runs of a match's bots, all different: `count` bots from the room's seed. */
export function botRuns(seed: number, count: number): number[] {
  const start = mix(seed, 7) % runs.length;
  return Array.from({ length: count }, (_, i) => (start + i * 7) % runs.length);
}

/** A bot's name and avatar by the order it joined (its avatar: the baby of its run's lead). */
export function botIdentity(index: number, run = index): { name: string; partner: string } {
  const lead = runs[run % runs.length][9]?.[0]?.[0] ?? "koromon";
  return { name: NAMES[index % NAMES.length], partner: babyOf(lead) };
}

/** The board a bot locks in for a round (past the last recorded round: the last board). */
export function botBoard(bot: Bot, round: number): BoardUnit[] {
  const boards = runs[bot.run % runs.length];
  const board = boards[Math.max(1, Math.min(round, boards.length)) - 1];
  return board.map(([formId, col, row, items = [], star], i) => ({ uid: `b${i}`, formId, col, row, items, ...(star ? { star } : {}) }));
}

const COMBAT = AUGMENT_IDS.filter((id) => AUGMENTS[id].kind === "combat");

/** On an augment round, the combat augment a bot takes (none it holds already). */
export function botAugment(seed: number, seat: number, round: number, owned: string[]): string | null {
  if (!AUGMENT_ROUNDS.includes(round)) return null;
  const left = COMBAT.filter((id) => !owned.includes(id));
  return left.length ? left[mix(seed ^ seat, round) % left.length] : null;
}
