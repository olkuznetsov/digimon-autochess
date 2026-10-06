/**
 * Full-run simulator: a bot plays complete solo runs through the REAL game store
 * (shop odds, merges, branch choices, XP, interest/streaks, items, enemy waves,
 * bosses, the fixed-step battle sim) and reports how far a sensible player gets.
 *
 * The bot plays like a decent human, not an optimal one: it chases 3-of-a-kinds
 * and its strongest traits, keeps interest gold until it is in danger, levels on a
 * standard curve, puts items on its carries and fronts tanks / backs casters.
 *
 * Run: npm run runsim [-- runs=300 seed=1 maxRound=25]
 *      npm run runsim -- dumpBoards=boards.json   (bots never die; writes every run's board on
 *      VS wild/boss rounds for tuning the VS waves offline — the solo report is then meaningless;
 *      allRounds=1 writes every round's board: the ghost ladder's seed)
 *      npm run runsim -- difficulty=hard           (easy | normal | hard)
 * (scripts/run-ts.mjs bundles this with the network + audio modules stubbed out,
 * so bots never post to the live leaderboard.)
 */
import { writeFileSync } from "node:fs";
import { boardCap, useGame, wireBoard, type PvpBoardUnit } from "../src/game/store";
import { MAX_ITEMS } from "../src/game/items";
import { pveFighters, simulate } from "../src/game/vsFights";
import { FORMS, costOf } from "../src/game/creatures";
import { SIM_DT } from "../src/game/battle";
import { traitCounts, TRAITS } from "../src/game/synergies";
import { COLS, BENCH_SLOTS } from "../src/game/board";
import type { Unit, Placement } from "../src/game/types";
import { ECONOMY, WAVES, isBossRound, makeEnemyWave, vsRoundKind } from "../src/game/tuning";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split("=")));
const RUNS = Number(args.runs ?? 300);
const SEED = Number(args.seed ?? 1);
const MAX_ROUND = Number(args.maxRound ?? 25);
const DUMP = args.dumpBoards as string | undefined;
const ALL_ROUNDS = args.allRounds === "1";
const DIFF = args.difficulty as "easy" | "normal" | "hard" | undefined;

// ---------- tuning experiments: `variant=name` applies one of these before the runs ----------
// boss knobs for quick sweeps: `r5=hp,atk,adds` etc. override one round's (first) candidate
const VARIANTS: Record<string, () => void> = {
  current: () => {},
  // a bigger roster merges slower: more gold for rolls?
  income8: () => void (ECONOMY.baseIncome = 8),
  start12: () => void (ECONOMY.startGold = 12),
  start11: () => void (ECONOMY.startGold = 11),
};
for (const round of [5, 10, 15]) {
  const spec = args[`r${round}`] as string | undefined;
  if (!spec) continue;
  const [hp, atk, adds] = spec.split(",").map(Number);
  WAVES.bosses[round / 5 - 1] = WAVES.bosses[round / 5 - 1].map((b) => ({ ...b, hp, atk, adds: (adds || b.adds) as typeof b.adds }));
}
const variant = String(args.variant ?? "current");
if (!VARIANTS[variant]) throw new Error(`unknown variant ${variant}: ${Object.keys(VARIANTS).join(", ")}`);
VARIANTS[variant]();

// ---------- deterministic randomness (the store uses Math.random) ----------
let seed = SEED;
Math.random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

const g = useGame;
const S = () => g.getState();

// ---------- bot heuristics ----------
const copiesOf = (formId: string) => S().units.filter((u) => u.formId === formId).length;
const onBoard = () => S().units.filter((u) => u.placement.kind === "board");

/** Rough strength of a unit: stage dominates, then items. */
function power(u: Unit): number {
  return FORMS[u.formId].stage * 100 + (u.items?.length ?? 0) * 15;
}

/** How much a form would add to the traits of the current board (0..). */
function synergyFit(formId: string, board: Unit[]): number {
  const f = FORMS[formId];
  const counts = traitCounts(board);
  let fit = 0;
  for (const key of [f.attribute, f.element]) {
    const c = counts.get(key) ?? 0;
    const def = TRAITS.find((t) => t.key === key);
    if (!def) continue; // Free babies, Neutral forms: no trait
    const next = def.tiers.find((t) => t.need > c);
    if (next && next.need - c === 1) fit += 3; // completes a tier
    else if (c > 0) fit += 1;
  }
  return fit;
}

/** Desired level by round — a standard curve, accelerated when rich. */
function targetLevel(round: number): number {
  return round >= 16 ? 9 : round >= 13 ? 8 : round >= 10 ? 7 : round >= 7 ? 6 : round >= 5 ? 5 : round >= 3 ? 4 : round >= 2 ? 3 : 2;
}

/** Gold the bot refuses to spend below: grows an interest bank from round 4 (10 per
 *  round, up to 50), spends only the excess, and rolls everything when in danger or late. */
function reserve(): number {
  const { health, round, streak } = S();
  if (round <= 3 || health <= 30 || round >= 14) return 0;
  const bank = Math.min(50, (round - 3) * 10);
  // a losing streak with a healthy bank: spend down to 20 to stabilize
  return streak <= -2 ? Math.min(bank, 20) : bank;
}

function resolvePending() {
  for (let i = 0; i < 8 && S().pendingEvolution; i++) {
    const p = S().pendingEvolution!;
    const board = onBoard();
    const best = [...p.options].sort((a, b) => synergyFit(b, board) - synergyFit(a, board))[0];
    S().chooseEvolution(best);
  }
}

function benchUnits() {
  return S().units.filter((u) => u.placement.kind === "bench");
}

/** Value of keeping a unit around (pairs and fielded strength matter most). */
function keepValue(u: Unit): number {
  return power(u) + copiesOf(u.formId) * 40 + lineDepth(u.formId) * 25 + synergyFit(u.formId, onBoard()) * 8;
}


/** Champions already owned in this rookie's line — each makes its copies worth more
 *  (three champions of one form become a Mega). */
function lineDepth(formId: string): number {
  const next = FORMS[formId].evolvesTo ?? [];
  return S().units.filter((u) => next.includes(u.formId)).length;
}

function shopValue(formId: string): number {
  const c = copiesOf(formId);
  const board = onBoard();
  const space = board.length < S().level ? 1 : 0;
  // a higher stage than the weakest fielded unit is an upgrade on its own (a discovered
  // Champion or Mega in the shop above all)
  const stage = FORMS[formId].stage;
  const weakest = board.length ? Math.min(...board.map((u) => FORMS[u.formId].stage)) : 0;
  const upgrade = space ? stage * 4 : Math.max(0, stage - weakest) * 20;
  return c * 50 + lineDepth(formId) * 30 + synergyFit(formId, board) * 10 + space * 15 + upgrade;
}

function buyRound() {
  for (let guard = 0; guard < 40; guard++) {
    resolvePending();
    const { shop, gold } = S();
    let bestIdx = -1;
    let bestVal = 0;
    shop.forEach((id, i) => {
      if (!id) return;
      const cost = costOf(id);
      const pair = copiesOf(id) >= 1 || lineDepth(id) >= 1;
      const short = S().units.length < S().level;
      // an unfilled board always buys; merges may dip into the reserve; speculation may not
      const floor = short ? 0 : pair ? Math.max(0, reserve() - 10) : reserve();
      if (gold - cost < floor) return;
      const v = shopValue(id);
      if (v > bestVal && (pair || v >= 18)) {
        bestVal = v;
        bestIdx = i;
      }
    });
    if (bestIdx < 0) return;
    const id = shop[bestIdx];
    const benchFull = benchUnits().length >= BENCH_SLOTS;
    if (benchFull && copiesOf(id) < 2) {
      const worst = benchUnits().sort((a, b) => keepValue(a) - keepValue(b))[0];
      if (!worst || keepValue(worst) >= bestVal + 100) return;
      S().sellUnit(worst.uid);
    }
    const before = S().units.length + S().gold;
    S().buy(bestIdx);
    if (S().units.length + S().gold === before) return; // nothing happened
  }
}

function levelUp() {
  const { round } = S();
  for (let i = 0; i < 10; i++) {
    const { level, gold } = S();
    if (level >= targetLevel(round) || gold - 4 < reserve()) return;
    S().buyXp();
  }
}

function rollDown() {
  // roll for upgrades when rich, or everything when in danger
  for (let i = 0; i < 12; i++) {
    const { gold, health } = S();
    const danger = health <= 35;
    const cost = ECONOMY.rerollCost;
    if (gold < cost || (!danger && gold - cost < reserve() + 12)) return;
    S().reroll();
    buyRound();
  }
}

/** columns from the middle outwards */
const FRONT = [3, 2, 4, 1, 5, 0, 6];
/** Field the strongest `level` units: tanks/bruisers in front, assassins mid, ranged/casters back. */
function arrange() {
  resolvePending();
  const { units, level, inventory } = S();
  const ranked = [...units].sort((a, b) => power(b) + synergyFit(b.formId, units) * 4 - (power(a) + synergyFit(a.formId, units) * 4));
  const fielded = ranked.slice(0, boardCap(units, level, inventory));
  const rows: Record<number, number> = { 3: 0, 2: 0, 1: 0, 0: 0 };
  const rowFor = (u: Unit) => {
    const role = FORMS[u.formId].role;
    // tanks and bruisers up front, assassins a row behind, ranged and casters at the back
    const pref = role === "tank" || role === "bruiser" ? [3, 2, 1, 0] : role === "assassin" ? [2, 3, 1, 0] : [0, 1, 2, 3];
    return pref.find((r) => rows[r] < COLS) ?? 0;
  };
  const byRole = [...fielded].sort((a, b) => order(FORMS[a.formId].role) - order(FORMS[b.formId].role));
  const placed = new Map<string, Placement>();
  for (const u of byRole) {
    const row = rowFor(u);
    placed.set(u.uid, { kind: "board", col: FRONT[rows[row]], row });
    rows[row]++;
  }
  let slot = 0;
  const next: Unit[] = [];
  for (const u of units) {
    const p = placed.get(u.uid);
    if (p) next.push({ ...u, placement: p });
    else if (slot < BENCH_SLOTS) next.push({ ...u, placement: { kind: "bench", slot: slot++ } });
    // extras beyond the bench are dropped (sold) below
  }
  const dropped = units.filter((u) => !next.some((n) => n.uid === u.uid));
  g.setState({ units: next });
  for (const u of dropped) S().sellUnit(u.uid);
}
const order = (role: string) => (role === "tank" ? 0 : role === "bruiser" ? 1 : role === "assassin" ? 2 : 3);

/** Items go straight onto the strongest carry with a free slot. Two components on one Digimon
 *  fuse on the spot (and every pair of components has a recipe), so this completes items on
 *  the carries as fast as they drop — holding parts back to plan recipes measured weaker
 *  (bosses 48/43/38% against 49/48/39%: a run loses the early stats). */
function equipItems() {
  for (let guard = 0; guard < 10; guard++) {
    const { inventory } = S();
    if (inventory.length === 0) return;
    const carries = onBoard()
      .filter((u) => (u.items?.length ?? 0) < MAX_ITEMS)
      .sort((a, b) => power(b) - power(a));
    if (carries.length === 0) return;
    S().selectItem(inventory[0]);
    S().equipItem(carries[0].uid);
  }
}

// ---------- one run ----------
interface RoundLog {
  round: number;
  win: boolean;
  time: number;
  damage: number;
  health: number;
  level: number;
  /** gold left after shopping (banked for interest) */
  gold: number;
  /** fielded units by stage: Fresh, In-Training, Rookie, Champion, Mega */
  stages: number[];
  /** VS wild/boss rounds only: did this board also beat the VS wave of the round? */
  vs?: boolean;
  /** VS wild/boss rounds, dump mode only */
  board?: PvpBoardUnit[];
  /** solo boss rounds with several candidates: which of them this board beats */
  bosses?: Record<string, boolean>;
}

/** Solo boss rounds offer one of several bosses per run: fight every candidate with the
 *  same board, so they can be tuned to the same pass rate (a paired comparison). */
function bossProbe(board: PvpBoardUnit[], round: number): Record<string, boolean> | undefined {
  const candidates = round <= 15 && isBossRound(round) ? WAVES.bosses[round / 5 - 1] : [];
  if (candidates.length < 2) return undefined;
  const out: Record<string, boolean> = {};
  for (const boss of candidates) {
    WAVES.bosses[round / 5 - 1] = [boss];
    // the player side exactly as a fight builds it (synergies included)
    const mine = pveFighters(board, round, 0).filter((f) => f.team === "player");
    out[boss.id] = simulate([...mine, ...makeEnemyWave(round)]).win;
  }
  WAVES.bosses[round / 5 - 1] = candidates;
  return out;
}

function playRun(): RoundLog[] {
  S().reset();
  if (DIFF) useGame.setState({ difficulty: DIFF });
  const log: RoundLog[] = [];
  while (S().round <= MAX_ROUND) {
    resolvePending();
    buyRound();
    levelUp();
    rollDown();
    resolvePending();
    arrange();
    equipItems();
    const board = onBoard();
    const goldLeft = S().gold;
    // VS probe: how would this board fare against the VS wave of the same round?
    const pve = vsRoundKind(S().round) !== "pvp";
    const wired = pve || (DUMP && ALL_ROUNDS) ? wireBoard(board) : undefined;
    const vs = pve && wired && simulate(pveFighters(wired, S().round, 0)).win;
    const bosses = bossProbe(wireBoard(board), S().round);
    const stages = [0, 0, 0, 0, 0];
    for (const u of board) stages[FORMS[u.formId].stage - 1]++;
    S().startBattle();
    if (S().phase !== "battle") break; // empty board — shouldn't happen
    let steps = 0;
    while (S().phase === "battle" && steps++ < 4000) S().stepBattle(SIM_DT);
    const st = S();
    log.push({
      round: st.round,
      win: st.result === "win",
      time: st.battleTime,
      damage: st.lastDamage,
      health: st.health,
      level: st.level,
      gold: goldLeft,
      stages,
      vs,
      board: DUMP ? wired : undefined,
      bosses,
    });
    if (DUMP) g.setState({ health: 100, gameOver: false }); // every run reaches every round
    else if (st.gameOver) break;
    st.toPrep();
  }
  return log;
}

// ---------- report ----------
const runs: RoundLog[][] = [];
for (let i = 0; i < RUNS; i++) runs.push(playRun());
if (DUMP) {
  const boards: Record<number, PvpBoardUnit[][]> = {};
  for (const x of runs.flat()) if (x.board) (boards[x.round] ??= []).push(x.board);
  writeFileSync(DUMP, JSON.stringify(boards));
  console.log(`wrote VS-round boards to ${DUMP}`);
}

const finalRound = runs.map((r) => (r.length === 0 ? 0 : r[r.length - 1].health <= 0 ? r[r.length - 1].round : r[r.length - 1].round + 0.5));
const sorted = [...finalRound].sort((a, b) => a - b);
const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
const cleared = (round: number) => runs.filter((r) => r.some((x) => x.round === round && x.health > 0)).length / RUNS;

console.log(`\n=== FULL-RUN SIM — ${RUNS} bot runs, seed ${SEED}, variant ${variant} ===`);
console.log(`death round: p10 ${pct(0.1)}  p25 ${pct(0.25)}  median ${pct(0.5)}  p75 ${pct(0.75)}  p90 ${pct(0.9)}`);
const beat = (round: number) => runs.filter((r) => r.some((x) => x.round === round && x.win)).length / RUNS;
console.log(`survived R5 ${(cleared(5) * 100).toFixed(0)}%  R10 ${(cleared(10) * 100).toFixed(0)}%  R15 ${(cleared(15) * 100).toFixed(0)}%  R20 ${(cleared(20) * 100).toFixed(0)}%`);
console.log(`beat the boss: R5 ${(beat(5) * 100).toFixed(0)}%  R10 ${(beat(10) * 100).toFixed(0)}%  R15 ${(beat(15) * 100).toFixed(0)}% (= run won)`);
// each candidate against the same boards: tune them to the same rate
const probed = [5, 10, 15].flatMap((round) => {
  const rows = runs.map((r) => r.find((x) => x.round === round)?.bosses).filter(Boolean) as Record<string, boolean>[];
  if (!rows.length) return [];
  const ids = Object.keys(rows[0]);
  return [`R${round} ` + ids.map((id) => `${id} ${((rows.filter((b) => b[id]).length / rows.length) * 100).toFixed(0)}%`).join(" · ") + ` (n=${rows.length})`];
});
if (probed.length) console.log(`boss candidates (same boards): ${probed.join("  |  ")}`);

// VS rounds use their own waves (tuning.ts `VS`); solo boards are a fair proxy for a
// VS player's board at the same round (same economy, shop and levels). Only rounds most
// runs reach: later on only the strong boards are left (dumpBoards mode has them all).
const vsRounds = Array.from({ length: MAX_ROUND }, (_, i) => i + 1).filter((r) => vsRoundKind(r) !== "pvp");
console.log(
  `VS wild/boss probe (same boards): ` +
    vsRounds
      .map((round) => {
        const rows = runs.map((r) => r.find((x) => x.round === round)).filter((x) => x?.vs !== undefined) as RoundLog[];
        if (rows.length < RUNS * 0.8) return null;
        const tag = vsRoundKind(round) === "boss" ? "boss " : "";
        return `${tag}R${round} ${((rows.filter((x) => x.vs).length / rows.length) * 100).toFixed(0)}%`;
      })
      .filter(Boolean)
      .join("  ") +
    (DUMP ? "" : "  (later rounds: dumpBoards)"),
);

console.log(`\nround  played  win%  avg-fight  avg-dmg-taken  avg-hp  lvl  banked  board stages (F/I/R/C/M)`);
for (let round = 1; round <= MAX_ROUND; round++) {
  const rows = runs.map((r) => r.find((x) => x.round === round)).filter(Boolean) as RoundLog[];
  if (rows.length === 0) break;
  const avg = (f: (x: RoundLog) => number) => rows.reduce((s, x) => s + f(x), 0) / rows.length;
  console.log(
    `${String(round).padStart(5)}  ${String(rows.length).padStart(6)}  ${(avg((x) => (x.win ? 1 : 0)) * 100).toFixed(0).padStart(4)}` +
      `  ${avg((x) => x.time).toFixed(1).padStart(8)}s  ${avg((x) => x.damage).toFixed(1).padStart(13)}  ${avg((x) => x.health).toFixed(0).padStart(6)}` +
      `  ${avg((x) => x.level).toFixed(1).padStart(3)}  ${avg((x) => x.gold).toFixed(0).padStart(6)}  ` +
      [0, 1, 2, 3, 4].map((i) => avg((x) => x.stages[i]).toFixed(1)).join("/"),
  );
}
process.exit(0);
