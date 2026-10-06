import type { Placement, Unit } from "./types";
import type { WireUnit } from "./lobby";
import { DIGIVICE } from "./items";
import { BENCH_SLOTS, COLS, PLAYER_ROWS, ROWS } from "./board";

/** Where units stand: the bench, the board, a fight's auto-fill and its room, the wire form. */

export function firstEmptyBench(units: Unit[]): number | null {
  const used = new Set(
    units.filter((u) => u.placement.kind === "bench").map((u) => (u.placement as { slot: number }).slot),
  );
  for (let i = 0; i < BENCH_SLOTS; i++) if (!used.has(i)) return i;
  return null;
}

export const boardCount = (units: Unit[]) => units.filter((u) => u.placement.kind === "board").length;
/** The same bench slot or the same board cell. */
export const samePlace = (a: Placement, b: Placement) =>
  a.kind === "bench" ? b.kind === "bench" && a.slot === b.slot : b.kind === "board" && a.col === b.col && a.row === b.row;
/** Columns from the middle outwards. */
export const COL_ORDER = Array.from({ length: COLS }, (_, i) => i).sort((a, b) => Math.abs(a - (COLS - 1) / 2) - Math.abs(b - (COLS - 1) / 2) || a - b);

/** Teamfight Tactics: a fight starts with every board slot filled — empty slots take bench
 *  units, first slot first, into the back row first (the middle columns first): the front
 *  stays the line the player set up. */
export function autoFill(units: Unit[], level: number, inventory: string[]): Unit[] {
  let out = units;
  const taken = new Set(
    units.filter((u) => u.placement.kind === "board").map((u) => {
      const p = u.placement as { col: number; row: number };
      return `${p.col},${p.row}`;
    }),
  );
  const bench = units
    .filter((u) => u.placement.kind === "bench")
    .sort((a, b) => (a.placement as { slot: number }).slot - (b.placement as { slot: number }).slot);
  for (const u of bench) {
    if (boardCount(out) >= boardCap(out, level, inventory)) break;
    // into the back rows: the front is the line the player set up themselves
    let cell: { col: number; row: number } | null = null;
    for (const row of PLAYER_ROWS) {
      for (const col of COL_ORDER) if (!cell && !taken.has(`${col},${row}`)) cell = { col, row };
      if (cell) break;
    }
    if (!cell) break;
    taken.add(`${cell.col},${cell.row}`);
    const placed = cell;
    out = out.map((x) => (x.uid === u.uid ? { ...x, placement: { kind: "board", ...placed } } : x));
  }
  return out;
}

/** Room on the board: the level, plus one for every Digivice owned — it works from the item
 *  tray (no Digimon has to hold it); one a Digimon holds, from an older save or fused right on
 *  it, counts all the same. */
export const boardCap = (units: Unit[], level: number, inventory: string[] = []) =>
  level +
  inventory.filter((i) => i === DIGIVICE).length +
  units.reduce((n, u) => n + (u.items ?? []).filter((i) => i === DIGIVICE).length, 0);

/** Mirror a board cell onto the other half (col 0 <-> 6, row 0 <-> 7). */
export const mirrorCol = (c: number) => COLS - 1 - c;
export const mirrorRow = (r: number) => ROWS - 1 - r;

/** Serialize on-board units (VS boards, live scouting, leaderboard ghost boards). */
export function wireBoard(units: Unit[]): WireUnit[] {
  return units
    .filter((u) => u.placement.kind === "board")
    .map((u) => {
      const p = u.placement as { col: number; row: number };
      return { uid: u.uid, formId: u.formId, col: p.col, row: p.row, items: u.items ?? [], ...(u.star ? { star: u.star } : {}) };
    });
}
