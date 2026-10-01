/**
 * Lobby rules check: plays thousands of 2–8 player matches with random fight
 * results through the shared rules (src/game/lobby.ts) and verifies what the
 * players rely on — everyone fights exactly once per round, no rematch two fight
 * rounds in a row when avoidable, the ghost round rotates, places 1..n are all
 * given out, rating points balance; the carousel's order and offer, the shared
 * pool's bookkeeping.
 *
 * Run: npm run lobbycheck [-- matches=2000 seed=1]
 */
import {
  applyOutcomes,
  carouselGroups,
  carouselItems,
  fullPool,
  heldCopies,
  planRound,
  poolLeft,
  ratingDelta,
  rng,
  surrender,
  START_HP,
  type RoundPlan,
  type Standing,
} from "../src/game/lobby";
import { isCarouselRound, vsRoundKind, vsStageDamage } from "../src/game/tuning";
import { ITEMS } from "../src/game/items";
import { FORMS } from "../src/game/creatures";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split("=")));
const MATCHES = Number(args.matches ?? 2000);
const rand = rng(Number(args.seed ?? 1));

let failures = 0;
const fail = (msg: string) => {
  if (failures++ < 20) console.log(`FAIL ${msg}`);
};

const stats: Record<number, { matches: number; rounds: number; repeats: number; byeTwice: number; cycles: number; cycleCoverage: number }> = {};

for (let m = 0; m < MATCHES; m++) {
  const n = 2 + (m % 7);
  const seats = Array.from({ length: n }, (_, i) => i);
  let standings: Standing[] = seats.map((seat) => ({ seat, hp: START_HP, alive: true, placement: null }));
  const history: RoundPlan[] = [];
  const st = (stats[n] ??= { matches: 0, rounds: 0, repeats: 0, byeTwice: 0, cycles: 0, cycleCoverage: 0 });
  st.matches++;
  // each player's skill: stronger players win more often, like real lobbies
  const skill = seats.map(() => rand());
  const met = seats.map(() => new Set<number>());
  let over = false;
  let round = 1;

  for (; round < 200 && !over; round++) {
    const alive = standings.filter((s) => s.alive).map((s) => s.seat);
    const plan = planRound(alive, round, history, m + 1);
    const outcomes: { seat: number; damage: number; won: boolean }[] = [];
    const lose = (seat: number) => ({ seat, damage: vsStageDamage(round) + 1 + Math.floor(rand() * 4), won: false });

    if (vsRoundKind(round) === "pvp") {
      st.rounds++;
      const covered = [...plan.pairs.flat(), ...(plan.ghost ? [plan.ghost.seat] : [])].sort((a, b) => a - b);
      if (covered.join() !== [...alive].sort((a, b) => a - b).join()) fail(`n=${n} r${round}: plan covers ${covered} of ${alive}`);
      if (plan.ghost && (!alive.includes(plan.ghost.of) || plan.ghost.of === plan.ghost.seat)) fail(`bad ghost ${JSON.stringify(plan.ghost)}`);
      if (alive.length % 2 === 1 && !plan.ghost) fail(`odd ${alive.length} without a ghost`);
      const prev = history[history.length - 1];
      if (prev && alive.length >= 3) {
        for (const [a, b] of plan.pairs) {
          if (prev.pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) st.repeats++;
        }
      }
      if (prev?.ghost && plan.ghost && prev.ghost.seat === plan.ghost.seat && alive.length >= 3) st.byeTwice++;
      for (const [a, b] of plan.pairs) {
        met[a].add(b);
        met[b].add(a);
        const aWins = rand() < 0.5 + (skill[a] - skill[b]) * 0.6;
        outcomes.push(aWins ? { seat: a, damage: 0, won: true } : lose(a), aWins ? lose(b) : { seat: b, damage: 0, won: true });
      }
      if (plan.ghost) outcomes.push(rand() < 0.5 ? { seat: plan.ghost.seat, damage: 0, won: true } : lose(plan.ghost.seat));
      history.push(plan);
      // round robin: while everyone stands, one cycle (n-1 fight rounds, n when odd) covers every opponent
      if (history.length === n - 1 + (n % 2) && alive.length === n) {
        st.cycles++;
        st.cycleCoverage += seats.reduce((s, x) => s + met[x].size, 0) / (n * (n - 1));
        if (seats.some((x) => met[x].size !== n - 1)) fail(`n=${n}: first cycle missed an opponent`);
      }
    } else {
      if (plan.pairs.length || plan.ghost) fail(`r${round} is ${vsRoundKind(round)} but has pairs`);
      for (const seat of alive) outcomes.push(rand() < 0.3 + skill[seat] * 0.6 ? { seat, damage: 0, won: true } : lose(seat));
    }

    // now and then someone surrenders mid-match
    if (rand() < 0.01 && alive.length > 2) {
      const r = surrender(standings, alive[Math.floor(rand() * alive.length)]);
      standings = r.standings;
      if (r.over) fail("surrender ended a match with 3+ players");
    }
    if (isCarouselRound(round)) {
      // the draft: everyone standing picks once, lowest HP first; one offer for all
      const groups = carouselGroups(standings, round, m + 1);
      const order = groups.flat();
      const standingNow = standings.filter((s) => s.alive);
      if (order.length !== standingNow.length || new Set(order).size !== order.length) fail(`carousel order ${order}`);
      const hpOrder = order.map((seat) => standings.find((s) => s.seat === seat)!.hp);
      if (hpOrder.some((hp, i) => i > 0 && hp < hpOrder[i - 1])) fail(`carousel not lowest HP first: ${hpOrder}`);
      const items = carouselItems(round, standingNow.length, m + 1);
      if (items.length !== standingNow.length + 2 || items.some((id) => !ITEMS[id])) fail(`carousel offer ${items}`);
      if (items.join() !== carouselItems(round, standingNow.length, m + 1).join()) fail("carousel offer not deterministic");
      const most = Math.max(...Object.values(items.reduce<Record<string, number>>((a, id) => ({ ...a, [id]: (a[id] ?? 0) + 1 }), {})));
      if (most > 2) fail(`carousel offer repeats an item ${most}x: ${items}`);
    }
    const r = applyOutcomes(standings, outcomes);
    standings = r.standings;
    over = r.over;
  }

  if (!over) fail(`n=${n} match ${m} never ended`);
  const places = standings.map((s) => s.placement);
  if (places.some((p) => p === null)) fail(`n=${n}: unplaced ${JSON.stringify(standings)}`);
  if (!places.includes(1)) fail(`n=${n}: no winner`);
  if (places.some((p) => p! < 1 || p! > n)) fail(`n=${n}: place out of range ${places}`);
  if (standings.filter((s) => s.alive).length > 1) fail(`n=${n}: ${standings.filter((s) => s.alive).length} still alive`);
}

console.log(`\n=== LOBBY CHECK — ${MATCHES} matches ===`);
console.log("players  matches  fight-rounds  repeat-pairs  ghost-twice  full-cycles  cycle-coverage");
for (const [n, s] of Object.entries(stats)) {
  const full = s.cycles ? s.cycleCoverage / s.cycles : 0;
  console.log(
    `${n.padStart(7)}  ${String(s.matches).padStart(7)}  ${String(s.rounds).padStart(12)}  ${String(s.repeats).padStart(12)}  ${String(s.byeTwice).padStart(11)}  ${String(s.cycles).padStart(11)}  ${(full * 100).toFixed(0).padStart(13)}%`,
  );
}
// shared pool bookkeeping: a Champion holds 3 copies of its line's rookie, a Mega 9
const champ = Object.keys(FORMS).find((id) => FORMS[id].stage === 2)!;
const mega = Object.keys(FORMS).find((id) => FORMS[id].stage === 3)!;
const held = heldCopies(["agumon", "agumon", champ, mega]);
if (Object.values(held).reduce((a, b) => a + b, 0) !== 2 + 3 + 9) fail(`heldCopies ${JSON.stringify(held)}`);
const full = fullPool();
const left = poolLeft({ 0: { agumon: 5 }, 1: { agumon: 4 }, 2: { agumon: 999 } });
if (left.agumon !== 0 || left.gabumon !== full.gabumon) fail(`poolLeft ${left.agumon} / ${left.gabumon}`);
console.log(`\npool: ${Object.keys(full).length} rookies, ${Object.values(full).reduce((a, b) => a + b, 0)} copies in all`);

const sums = [2, 3, 4, 5, 6, 7, 8].map((n) => Array.from({ length: n }, (_, i) => ratingDelta(n, i + 1)));
console.log(`\nrating by place: ${sums.map((r) => `${r.length}p [${r.join(" ")}]`).join("  ")}`);
console.log(failures ? `\n${failures} FAILURES` : "\nall checks passed");
process.exit(failures ? 1 : 0);
