import { vsRoundKind } from "./tuning";

/**
 * Lobby rules for 2–8 players, shared by the clients and the match server
 * (server/src/index.ts imports this file): who fights whom each round, the ghost
 * for an odd player count, damage, eliminations, placements and rating points.
 * Pure and deterministic — the server plans and keeps the standings, clients
 * show them.
 */

export const MAX_PLAYERS = 8;
export const START_HP = 100;

/** One player's standing in a match. `hp` can drop below 0 in the round a player
 *  is eliminated: whoever fell less deep places higher. */
export interface Standing {
  seat: number;
  hp: number;
  alive: boolean;
  /** final place (1 = winner), set when eliminated or when the match ends */
  placement: number | null;
}

/** Who fights whom in a round. Wild / boss rounds have no pairs (everyone fights
 *  the same wave). `home` is the canonical "player" side of the fight. */
export interface RoundPlan {
  round: number;
  pairs: [number, number][];
  /** odd player count: `seat` fights a copy of `of`'s board ("ghost"); `of` is unaffected */
  ghost: { seat: number; of: number } | null;
}

/** A player's result in one round, as every client computes it from the boards. */
export interface Outcome {
  seat: number;
  damage: number;
  won: boolean;
}

/** Seeded PRNG (mulberry32) so the server's choices are reproducible in tests. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const met = (p: RoundPlan, a: number, b: number) =>
  p.pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a)) ||
  (p.ghost !== null && ((p.ghost.seat === a && p.ghost.of === b) || (p.ghost.seat === b && p.ghost.of === a)));

const seatsOf = (p: RoundPlan) => [...p.pairs.flat(), ...(p.ghost ? [p.ghost.seat] : [])].sort((a, b) => a - b);

/** Round `j` of a round-robin over `order` (circle method): order[0] stays put,
 *  the rest rotate; with an odd count the one paired with the empty slot sits
 *  out (fights a ghost). Every pair meets once per cycle, every player sits out once. */
function circle(order: number[], j: number): { pairs: [number, number][]; bye: number | null } {
  const slots = order.length % 2 ? [...order, -1] : order;
  const n = slots.length;
  const r = j % (n - 1);
  const rest = slots.slice(1);
  const ring = [slots[0], ...rest.slice(rest.length - r), ...rest.slice(0, rest.length - r)];
  const pairs: [number, number][] = [];
  let bye: number | null = null;
  for (let i = 0; i < n / 2; i++) {
    const a = ring[i];
    const b = ring[n - 1 - i];
    if (a === -1) bye = b;
    else if (b === -1) bye = a;
    else pairs.push([a, b]);
  }
  return { pairs, bye };
}

/**
 * Pairings for a fight round, Teamfight Tactics style. While the same players
 * are standing they play a round-robin (everyone meets everyone once per cycle,
 * the ghost round rotates); when someone is knocked out a new cycle starts in a
 * fresh seeded order whose first round avoids the previous round's pairs.
 * `history` holds the earlier fight rounds' plans, oldest first.
 */
export function planRound(alive: number[], round: number, history: RoundPlan[], seed: number): RoundPlan {
  if (vsRoundKind(round) !== "pvp" || alive.length < 2) return { round, pairs: [], ghost: null };
  const set = [...alive].sort((a, b) => a - b);
  // the current cycle: trailing fight rounds played by exactly these players
  let k = history.length;
  while (k > 0 && seatsOf(history[k - 1]).join() === set.join()) k--;
  const prev = k > 0 ? history[k - 1] : null;
  const rand = rng(seed * 7919 + (k < history.length ? history[k].round : round) * 104729);

  let order = set;
  for (let attempt = 0; attempt < 40; attempt++) {
    const shuffled = [...set];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    if (attempt === 0) order = shuffled;
    const first = circle(shuffled, 0);
    const clash =
      prev !== null &&
      (first.pairs.some(([a, b]) => met(prev, a, b)) || (first.bye !== null && prev.ghost?.seat === first.bye));
    if (!clash) {
      order = shuffled;
      break;
    }
  }
  const { pairs, bye } = circle(order, history.length - k);

  let ghost: RoundPlan["ghost"] = null;
  if (bye !== null) {
    // the ghost copies whoever the bye player has gone longest without facing
    const lastMet = (s: number) => {
      for (let i = history.length - 1; i >= 0; i--) if (met(history[i], bye, s)) return i;
      return -1;
    };
    const of = set.filter((s) => s !== bye).reduce((a, b) => (lastMet(b) < lastMet(a) ? b : a));
    ghost = { seat: bye, of };
  }
  return { round, pairs: pairs.map(([a, b]) => (a < b ? [a, b] : [b, a]) as [number, number]), ghost };
}

/** Which fight a seat is in this round (null on wild / boss rounds). */
export function opponentOf(plan: RoundPlan | null, seat: number): { seat: number; ghost: boolean; home: boolean } | null {
  if (!plan) return null;
  if (plan.ghost?.seat === seat) return { seat: plan.ghost.of, ghost: true, home: true };
  for (const [home, away] of plan.pairs) {
    if (home === seat) return { seat: away, ghost: false, home: true };
    if (away === seat) return { seat: home, ghost: false, home: false };
  }
  return null;
}

/**
 * Apply one round's outcomes: damage, then eliminations. Players who fall in the
 * same round take the places behind everyone still standing, the one who fell
 * least deep first (equal HP shares a place). The match is over once at most one
 * player stands; the last one standing places first.
 */
export function applyOutcomes(
  standings: Standing[],
  outcomes: Outcome[],
): { standings: Standing[]; eliminated: number[]; over: boolean } {
  const next = standings.map((s) => ({ ...s }));
  for (const o of outcomes) {
    const s = next.find((x) => x.seat === o.seat);
    if (s?.alive) s.hp -= o.damage;
  }
  return settle(next);
}

/** A player surrenders: out now, in the worst place still open. */
export function surrender(standings: Standing[], seat: number): { standings: Standing[]; eliminated: number[]; over: boolean } {
  const next = standings.map((s) => ({ ...s }));
  const s = next.find((x) => x.seat === seat);
  if (!s?.alive) return { standings: next, eliminated: [], over: false };
  // below everyone else's HP, so the surrender takes the last open place
  s.hp = Math.min(0, ...next.map((x) => x.hp)) - 1;
  return settle(next);
}

function settle(next: Standing[]): { standings: Standing[]; eliminated: number[]; over: boolean } {
  const falling = next.filter((s) => s.alive && s.hp <= 0).sort((a, b) => b.hp - a.hp);
  const standing = next.filter((s) => s.alive && s.hp > 0).length;
  let place = standing + 1;
  falling.forEach((s, i) => {
    if (i > 0 && s.hp < falling[i - 1].hp) place = standing + 1 + i;
    s.alive = false;
    s.placement = place;
  });
  const over = standing <= 1 && next.length > 1;
  if (over) for (const s of next) if (s.alive) s.placement = 1;
  return { standings: next, eliminated: falling.map((s) => s.seat), over };
}

/** Behind on HP = more players still standing above you than below (the bottom
 *  half; ties at the bottom count too) — the Arsenal's catch-up offer. */
export function isBehind(standings: Standing[], seat: number): boolean {
  const me = standings.find((s) => s.seat === seat);
  if (!me?.alive) return false;
  const alive = standings.filter((s) => s.alive);
  return alive.filter((s) => s.hp > me.hp).length > alive.filter((s) => s.hp < me.hp).length;
}

/** Rating points for a final place: ±40 for 1st / last of eight, scaled down in
 *  smaller lobbies (a 1v1 win is worth ±6). */
export function ratingDelta(players: number, placement: number): number {
  return Math.round((40 * (players + 1 - 2 * placement)) / 7);
}

// ---------- wire format (server → clients) ----------

/** A board unit as sent over the wire (VS boards, live scouting, ghost boards). */
export interface WireUnit {
  uid: string;
  formId: string;
  col: number;
  row: number;
  items: string[];
}

/** A seat as every client sees it. */
export interface LobbySeat {
  seat: number;
  name: string;
  online: boolean;
  /** playing the current (or last) match — false for someone who joined after it ended */
  inMatch: boolean;
  hp: number;
  alive: boolean;
  placement: number | null;
  /** locked in for the current round */
  ready: boolean;
}

/** The room as the server sends it on every change. */
export interface LobbySnapshot {
  stage: "lobby" | "match" | "over";
  /** who may start (and restart) the match */
  host: number;
  /** bumps on every new match in the room, so late messages of the last one are ignored */
  match: number;
  /** the round being planned or fought */
  round: number;
  /** the round's fight has started and its result isn't in yet */
  fighting: boolean;
  plan: RoundPlan | null;
  /** players at the start of the match (rating scale) */
  players: number;
  seats: LobbySeat[];
}

/** A round's fight as broadcast when every player is locked in. */
export interface LobbyFight {
  match: number;
  round: number;
  plan: RoundPlan;
  boards: Record<number, WireUnit[]>;
}
