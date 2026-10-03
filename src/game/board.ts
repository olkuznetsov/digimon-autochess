// Board geometry shared by the store and the 3D scene.

// Teamfight Tactics' board size: 7 × 4 per side (28 cells — room for level 10 and
// Digivices, and a real backline) and a bench of 9.
export const COLS = 7;
export const ROWS = 8; // rows 0..3 = player half, rows 4..7 = enemy half
export const PLAYER_ROWS = [0, 1, 2, 3];
/** the player's front row (next to the midline) */
export const FRONT_ROW = PLAYER_ROWS.length - 1;
export const BENCH_SLOTS = 9;

export const CELL = 1.1; // world size of one cell
/** bench slots sit closer than board cells: all nine span the board's width (phones) */
export const BENCH_STEP = (COLS * CELL) / BENCH_SLOTS;

/** Convert a board cell to a world XZ position (y handled by caller). */
export function cellToWorld(col: number, row: number): [number, number] {
  const x = (col - (COLS - 1) / 2) * CELL;
  const z = (row - (ROWS - 1) / 2) * CELL;
  return [x, z];
}

/** Z line where the bench row sits (negative = toward the camera / player side). */
export const BENCH_Z = -((ROWS - 1) / 2) * CELL - CELL * 0.95;

/** Bench sits in front of the player half (toward the camera). The camera looks along
 *  +z, so world +x is screen-left — slot 0 (where purchases land) sits at +x, leftmost. */
export function benchToWorld(slot: number): [number, number] {
  const x = ((BENCH_SLOTS - 1) / 2 - slot) * BENCH_STEP;
  return [x, BENCH_Z];
}

/** Z midpoint separating "drop on board" from "drop on bench". */
export const BENCH_BOUNDARY = (BENCH_Z + cellToWorld(0, 0)[1]) / 2;

/** Nearest board cell to a world XZ point, clamped to the player half. */
export function worldToPlayerCell(x: number, z: number): { col: number; row: number } {
  const col = Math.round(x / CELL + (COLS - 1) / 2);
  const row = Math.round(z / CELL + (ROWS - 1) / 2);
  return {
    col: Math.max(0, Math.min(COLS - 1, col)),
    row: Math.max(0, Math.min(FRONT_ROW, row)), // player half only
  };
}

export function worldToBenchSlot(x: number): number {
  const slot = Math.round((BENCH_SLOTS - 1) / 2 - x / BENCH_STEP);
  return Math.max(0, Math.min(BENCH_SLOTS - 1, slot));
}
