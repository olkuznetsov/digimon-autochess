// Board geometry shared by the store and the 3D scene.

export const COLS = 6;
export const ROWS = 6; // rows 0..2 = player half, rows 3..5 = enemy half
export const PLAYER_ROWS = [0, 1, 2];
export const BENCH_SLOTS = 6;

export const CELL = 1.1; // world size of one cell

/** Convert a board cell to a world XZ position (y handled by caller). */
export function cellToWorld(col: number, row: number): [number, number] {
  const x = (col - (COLS - 1) / 2) * CELL;
  const z = (row - (ROWS - 1) / 2) * CELL;
  return [x, z];
}

/** Z line where the bench row sits (negative = toward the camera / player side). */
export const BENCH_Z = -((ROWS - 1) / 2) * CELL - CELL * 1.4;

/** Bench sits in front of the player half (toward the camera). */
export function benchToWorld(slot: number): [number, number] {
  const x = (slot - (BENCH_SLOTS - 1) / 2) * CELL;
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
    row: Math.max(0, Math.min(2, row)), // player half only
  };
}

export function worldToBenchSlot(x: number): number {
  const slot = Math.round(x / CELL + (BENCH_SLOTS - 1) / 2);
  return Math.max(0, Math.min(BENCH_SLOTS - 1, slot));
}
