#!/usr/bin/env node
/**
 * Writes server/src/bot-runs.json: the boards the VS bots play — real runs of the run-sim bot
 * (buys, merges, levels, items, stars), every round from 1 to ROUNDS, RUNS of them. A bot keeps
 * one run for the whole match, so its board grows the way a player's does.
 *
 *   node scripts/bot-runs.mjs            (deterministic: the same seed writes the same file)
 *
 * Format, kept small for the worker bundle: runs[run][round - 1] = a board, each unit
 * [formId, col, row] plus [items] and a star when it has them.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RUNS = 24;
const ROUNDS = 40;
const SEED = 2026;
const dump = join(tmpdir(), `bot-runs-${process.pid}.json`);

execFileSync(
  "node",
  ["scripts/run-ts.mjs", "scripts/run-sim.ts", `runs=${RUNS}`, `seed=${SEED}`, `maxRound=${ROUNDS}`, "allRounds=1", `dumpBoards=${dump}`],
  { stdio: ["ignore", "ignore", "inherit"] },
);
const byRound = JSON.parse(readFileSync(dump, "utf8"));

const runs = Array.from({ length: RUNS }, (_, run) =>
  Array.from({ length: ROUNDS }, (_, i) => {
    const board = byRound[i + 1]?.[run];
    if (!board) throw new Error(`run ${run} has no board for round ${i + 1}`);
    return board.map((u) => {
      const unit = [u.formId, u.col, u.row];
      if (u.items?.length || u.star) unit.push(u.items ?? []);
      if (u.star) unit.push(u.star);
      return unit;
    });
  }),
);
const out = "server/src/bot-runs.json";
writeFileSync(out, JSON.stringify(runs));
console.log(`${out}: ${RUNS} runs × ${ROUNDS} rounds, ${(JSON.stringify(runs).length / 1024).toFixed(0)} KB`);
