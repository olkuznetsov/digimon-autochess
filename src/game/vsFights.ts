import type { Fighter, Unit } from "./types";
import { makeFighter, stepCombat, SIM_DT } from "./battle";
import { applySynergies } from "./synergies";
import { makeVsWave, vsRoundKind, vsStageDamage } from "./tuning";
import { COLS, ROWS } from "./board";
import { applyAugments } from "./augments";
import type { Outcome, RoundPlan, WireUnit } from "./lobby";

/** Each seat's augments (the room sends them with every fight). */
type Augs = Record<number, string[]>;

/**
 * The fights of a VS round, built identically on every client: each client
 * renders its own fight and simulates all the others headless, so everyone
 * computes the same outcomes from the same boards (the sim is deterministic).
 */

/** A fight that hasn't ended after this many steps (200 s) is a draw — on screen too. */
export const FIGHT_STEPS = 4000;

const mirrorCol = (c: number) => COLS - 1 - c;
const mirrorRow = (r: number) => ROWS - 1 - r;

/** A wire board unit as a Unit (applySynergies only counts forms). */
const asUnit = (uid: string, u: WireUnit): Unit => ({
  uid,
  formId: u.formId,
  placement: { kind: "board", col: u.col, row: u.row },
  items: u.items ?? [],
  ...(u.star === 2 || u.star === 3 ? { star: u.star } : {}),
});

/** One side of a fight: a board as fighters with its synergies and its player's
 *  combat augments; the away side is mirrored onto the far half. */
function side(board: WireUnit[], prefix: string, team: "player" | "enemy", augments: string[] = []): Fighter[] {
  const away = team === "enemy";
  const fighters = board.map((u) =>
    makeFighter(
      u.formId,
      `${prefix}${u.uid}`,
      team,
      away ? mirrorCol(u.col) : u.col,
      away ? mirrorRow(u.row) : u.row,
      1,
      u.items ?? [],
      u.star ?? 1,
    ),
  );
  applySynergies(fighters, board.map((u) => asUnit(`${prefix}${u.uid}`, u)));
  applyAugments(fighters, augments);
  return fighters;
}

/** Two players: `home` on the near half as "player", `away` mirrored as "enemy". Ticks
 *  resolve simultaneously (battle.ts), so neither side acts first — a mirror is a draw. */
export function duelFighters(
  round: number,
  home: number,
  homeBoard: WireUnit[],
  away: number,
  awayBoard: WireUnit[],
  augs: Augs = {},
): Fighter[] {
  const h = side(homeBoard, `${home}_`, "player", augs[home]);
  const a = side(awayBoard, `${away}_`, "enemy", augs[away]);
  return round % 2 === 1 ? [...h, ...a] : [...a, ...h];
}

/** A player against a ghost copy of another player's board (the odd one out) —
 *  the copy fights with its owner's augments. */
export function ghostFighters(
  round: number,
  seat: number,
  board: WireUnit[],
  of: number,
  ghostBoard: WireUnit[],
  augs: Augs = {},
): Fighter[] {
  const h = side(board, `${seat}_`, "player", augs[seat]);
  const g = side(ghostBoard, `g${of}_`, "enemy", augs[of]);
  return round % 2 === 1 ? [...h, ...g] : [...g, ...h];
}

/** A ghost-ladder fight: your board on the near half against a ghost's — another tamer's
 *  board, mirrored onto the far one, no augments. Built the same way by the client, which plays
 *  it, and by the worker, which rates it (it plays the fight itself instead of taking a win on
 *  trust). A seed ghost's units may have no uid: their index stands in. */
export function ladderFighters(mine: WireUnit[], ghost: WireUnit[]): Fighter[] {
  const near = mine.map((u) => makeFighter(u.formId, `m_${u.uid}`, "player", u.col, u.row, 1, u.items ?? [], u.star ?? 1));
  applySynergies(near, mine.map((u) => asUnit(`m_${u.uid}`, u)));
  const far = ghost.map((u, i) =>
    makeFighter(u.formId, `g_${u.uid ?? i}`, "enemy", mirrorCol(u.col), mirrorRow(u.row), 1, u.items ?? [], u.star ?? 1),
  );
  applySynergies(far, ghost.map((u, i) => asUnit(`g_${u.uid ?? i}`, u)));
  return [...near, ...far];
}

/** A ladder fight still undecided after this many steps (45 s) is lost — on screen too. */
export const LADDER_STEPS = 900;

/** Does your board beat the ghost? Stepped exactly as the screen steps it. */
export function ladderWins(mine: WireUnit[], ghost: WireUnit[]): boolean {
  const fighters = ladderFighters(mine, ghost);
  for (let i = 0; i < LADDER_STEPS; i++) {
    stepCombat(fighters, SIM_DT);
    const near = fighters.some((f) => f.hp > 0 && f.team === "player");
    const far = fighters.some((f) => f.hp > 0 && f.team === "enemy");
    if (!near || !far) return near && !far;
  }
  return false;
}

/** A player against the round's wild / boss wave (`variant`: the room's, picks the boss). */
export function pveFighters(board: WireUnit[], round: number, seat: number, augments: string[] = [], variant = 0): Fighter[] {
  return [...side(board, `${seat}_`, "player", augments), ...makeVsWave(round, "W", variant)];
}

/** Run a fight to the end without rendering. */
export function runFight(fighters: Fighter[]): { winner: "home" | "away" | "draw"; alive: number; enemies: number } {
  for (let i = 0; i < FIGHT_STEPS; i++) {
    if (!fighters.some((f) => f.hp > 0 && f.team === "player") || !fighters.some((f) => f.hp > 0 && f.team === "enemy")) break;
    stepCombat(fighters, SIM_DT);
  }
  const alive = fighters.filter((f) => f.hp > 0);
  const home = alive.some((f) => f.team === "player");
  const enemies = alive.filter((f) => f.team === "enemy").length;
  return { winner: home && !enemies ? "home" : enemies && !home ? "away" : "draw", alive: alive.length, enemies };
}

/** How a board fares against a wild / boss wave (balance tools). */
export function simulate(fighters: Fighter[]): { win: boolean; survivors: number } {
  const r = runFight(fighters);
  return { win: r.winner === "home", survivors: r.enemies };
}

/**
 * Every player's outcome in a round. A loss costs the stage's damage plus one
 * per unit left standing on the other side (a draw costs both players).
 */
export function roundOutcomes(
  round: number,
  plan: RoundPlan,
  boards: Record<number, WireUnit[]>,
  alive: number[],
  augs: Augs = {},
  variant = 0,
): Outcome[] {
  const stage = vsStageDamage(round);
  const out = new Map<number, Outcome>();
  const board = (seat: number) => boards[seat] ?? [];
  if (vsRoundKind(round) !== "pvp") {
    for (const seat of alive) {
      const r = runFight(pveFighters(board(seat), round, seat, augs[seat], variant));
      const won = r.winner === "home";
      out.set(seat, { seat, won, damage: won ? 0 : stage + r.enemies });
    }
  } else {
    for (const [home, away] of plan.pairs) {
      const r = runFight(duelFighters(round, home, board(home), away, board(away), augs));
      out.set(home, { seat: home, won: r.winner === "home", damage: r.winner === "home" ? 0 : stage + r.alive });
      out.set(away, { seat: away, won: r.winner === "away", damage: r.winner === "away" ? 0 : stage + r.alive });
    }
    if (plan.ghost) {
      const { seat, of } = plan.ghost;
      const r = runFight(ghostFighters(round, seat, board(seat), of, board(of), augs));
      out.set(seat, { seat, won: r.winner === "home", damage: r.winner === "home" ? 0 : stage + r.alive });
    }
  }
  return alive.map((seat) => out.get(seat) ?? { seat, won: true, damage: 0 });
}

/** FNV-1a over a round's outcomes: the room compares clients' reports with it. */
export function outcomesHash(outcomes: Outcome[]): string {
  let h = 2166136261;
  const text = outcomes.map((o) => `${o.seat}:${o.damage}:${o.won ? 1 : 0}`).join("|");
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
