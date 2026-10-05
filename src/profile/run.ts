import { create } from "zustand";
import type { Element } from "../game/types";
import { XP } from "./profile";

/**
 * The run ledger: what a solo run has done so far, kept beside the run's save (and synced
 * with it). A run pays its tamer XP when it ends — at game over, or once round 15's battle is
 * fought (endless rounds earn none) — and the run report shows where every point came from.
 */
export const RUN_KEY = "dac-run-v1";
/** the solo run: 15 rounds, the last one the final boss */
export const RUN_ROUNDS = 15;

export interface RunLedger {
  v: 1;
  /** the run it belongs to (the game's runSeed) */
  seed: number;
  startedAt: number;
  /** the furthest round fought */
  round: number;
  won: number;
  lost: number;
  bosses: number;
  /** damage the tamer's Digimon dealt */
  dealt: number;
  /** health the tamer lost */
  hpLost: number;
  streak: number;
  bestStreak: number;
  digivolutions: number;
  /** forms raised for the first time ever during this run */
  firsts: string[];
  items: number;
  /** damage by unit, under its latest form (the MVP) */
  units: Record<string, { formId: string; dealt: number }>;
  /** how often each element stood on the board */
  elements: Partial<Record<Element, number>>;
  /** what earns XP: rounds 1–15 */
  scored: { won: number; lost: number; bosses: number; runWon: boolean };
  /** the XP went to the tamer: how much, and their XP before it */
  paid: { xp: number; before: number; at: number } | null;
  /** the board in the last battle */
  board: string[];
  endedAt: number | null;
}

export function newLedger(seed: number, round: number): RunLedger {
  return {
    v: 1,
    seed,
    startedAt: Date.now(),
    round: Math.max(0, round - 1),
    won: 0,
    lost: 0,
    bosses: 0,
    dealt: 0,
    hpLost: 0,
    streak: 0,
    bestStreak: 0,
    digivolutions: 0,
    firsts: [],
    items: 0,
    units: {},
    elements: {},
    scored: { won: 0, lost: 0, bosses: 0, runWon: false },
    paid: null,
    board: [],
    endedAt: null,
  };
}

/** Where a run's XP comes from, line by line. */
export function xpLines(l: RunLedger): { label: string; count: number; each: number; once?: boolean }[] {
  return [
    { label: "Battles won", count: l.scored.won, each: XP.battleWon },
    { label: "Battles lost", count: l.scored.lost, each: XP.battleLost },
    { label: "Bosses beaten", count: l.scored.bosses, each: XP.boss },
    { label: "Run won", count: l.scored.runWon ? 1 : 0, each: XP.runWon, once: true },
  ];
}
export const runXp = (l: RunLedger) => xpLines(l).reduce((a, x) => a + x.count * x.each, 0);

function load(): RunLedger | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    const l = raw ? (JSON.parse(raw) as RunLedger) : null;
    return l?.v === 1 ? l : null;
  } catch {
    return null;
  }
}

export const useRun = create<{ ledger: RunLedger | null }>(() => ({ ledger: load() }));

/** Change the ledger (a copy, so the report re-renders). */
export function updateRun(fn: (l: RunLedger) => void) {
  const l = useRun.getState().ledger;
  if (!l) return;
  const next = structuredClone(l);
  fn(next);
  useRun.setState({ ledger: next });
}

useRun.subscribe((s) => {
  try {
    if (s.ledger) localStorage.setItem(RUN_KEY, JSON.stringify(s.ledger));
    else localStorage.removeItem(RUN_KEY);
  } catch {
    /* storage full or blocked: the ledger lives for this visit */
  }
});
