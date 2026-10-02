import { VS, vsRoundKind } from "./tuning";
import { FORMS, PLAYABLE_IDS, mergeParts } from "./creatures";
import { BASE_ITEM_IDS, FUSED_ITEM_IDS } from "./items";

/**
 * Lobby rules for 2–8 players, shared by the clients and the match server
 * (server/src/lobby.ts imports this file): who fights whom each round, the ghost
 * for an odd player count, damage, eliminations, placements, rating points, the
 * shared unit pool and the carousel. Pure and deterministic — the server plans
 * and keeps the standings, clients show them.
 */

export const MAX_PLAYERS = 8;
export const START_HP = 100;
/** Close code for a client whose rules differ from the room's (an update went out): reload. */
export const CLOSE_OUTDATED = 4001;

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

/** Rating points for a final place: ±40 for 1st / last of eight, scaled down in
 *  smaller lobbies (a 1v1 win is worth ±6). */
export function ratingDelta(players: number, placement: number): number {
  return Math.round((40 * (players + 1 - 2 * placement)) / 7);
}

// ---------- shared unit pool ----------
// Teamfight Tactics' shared pool: every form exists in a limited number of copies for
// the whole lobby, so what one player collects the others can't — fewer the higher the
// tier. A merged unit keeps holding every copy that went into it.

export const POOL_COPIES: Record<number, number> = { 1: 30, 2: 25, 3: 18, 4: 10, 5: 9 };

/** A full pool: copies of every form the shop can offer. */
export function fullPool(): Record<string, number> {
  return Object.fromEntries(PLAYABLE_IDS.map((id) => [id, POOL_COPIES[FORMS[id].stage] ?? 9]));
}

/** Copies held by a set of units — a merged unit holds every copy merged into it. */
export function heldCopies(units: { formId: string; parts?: Record<string, number> }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(mergeParts(units))) if (FORMS[id]) out[id] = n;
  return out;
}

/** What's left: the full pool minus everyone's holdings (never below 0). */
export function poolLeft(held: Record<number, Record<string, number>>): Record<string, number> {
  const pool = fullPool();
  for (const counts of Object.values(held)) {
    for (const [id, n] of Object.entries(counts)) if (id in pool) pool[id] -= n;
  }
  for (const id in pool) pool[id] = Math.max(0, pool[id]);
  return pool;
}

// ---------- carousel ----------
// The item draft on the 3rd round of every stage (Teamfight Tactics' carousel):
// one shared offer of players + 2 items, the lowest HP picks first, released in
// pairs every few seconds; whoever doesn't pick gets one at the end.

export const CAROUSEL_STEP_MS = 4000;
/** the carousel opens once everyone is planning — or after this, for slow fights */
export const CAROUSEL_WAIT_MS = 25_000;

export interface Carousel {
  round: number;
  items: string[];
  /** item index → the seat that took it */
  taken: Record<number, number>;
  /** pick order, lowest HP first; each group is released CAROUSEL_STEP_MS after the last */
  groups: number[][];
  /** when the first group may pick (ms epoch); 0 = still waiting for players */
  opensAt: number;
  done: boolean;
}

/** The offer: players + 2 items, mostly base items early, more fused ones later —
 *  varied: no item repeats until every one of its kind is on the carousel. */
export function carouselItems(round: number, players: number, seed: number): string[] {
  const rand = rng(seed * 131 + round * 7);
  const shuffled = <T,>(arr: T[]) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const n = players + 2;
  const stage = Math.ceil(round / VS.stageLength);
  const fused = Math.min(n, stage <= 1 ? 1 : stage === 2 ? 2 : Math.ceil(n / 2));
  const deal = (ids: string[], k: number) => {
    const out: string[] = [];
    while (out.length < k) out.push(...shuffled(ids));
    return out.slice(0, k);
  };
  return shuffled([...deal(FUSED_ITEM_IDS, fused), ...deal(BASE_ITEM_IDS, n - fused)]);
}

/** Pick order: lowest HP first (ties shuffled), in pairs from four players up. */
export function carouselGroups(standings: Standing[], round: number, seed: number): number[][] {
  const rand = rng(seed * 977 + round);
  const order = standings
    .filter((s) => s.alive)
    .map((s) => ({ s, tie: rand() }))
    .sort((a, b) => a.s.hp - b.s.hp || a.tie - b.tie)
    .map((x) => x.s.seat);
  const size = order.length >= 4 ? 2 : 1;
  const groups: number[][] = [];
  for (let i = 0; i < order.length; i += size) groups.push(order.slice(i, i + size));
  return groups;
}

/** When a seat's group may start picking (Infinity while the carousel is closed). */
export function carouselTurn(c: Carousel, seat: number): number {
  const g = c.groups.findIndex((grp) => grp.includes(seat));
  return c.opensAt > 0 && g >= 0 ? c.opensAt + g * CAROUSEL_STEP_MS : Infinity;
}

/** When the carousel closes: the last group released still gets two steps to pick. */
export const carouselEnd = (c: Carousel) => c.opensAt + (c.groups.length + 1) * CAROUSEL_STEP_MS;

/** The item a seat took, if any. */
export function carouselPick(c: Carousel, seat: number): string | null {
  const i = Object.entries(c.taken).find(([, s]) => s === seat)?.[0];
  return i === undefined ? null : c.items[Number(i)];
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
  /** augments picked this match (public, like in TFT) */
  augments: string[];
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
  /** copies of each rookie left in the shared pool */
  pool: Record<string, number>;
  /** this round's item draft, on carousel rounds */
  carousel: Carousel | null;
  /** a public match from the matchmaking queue: it starts by itself */
  public: boolean;
  /** public match: the players it waits for before starting */
  expect: number;
  /** a random number per match that picks its bosses (0 from a room saved before) */
  variant: number;
}

/** A round's fight as broadcast when every player is locked in. */
export interface LobbyFight {
  match: number;
  round: number;
  plan: RoundPlan;
  boards: Record<number, WireUnit[]>;
  /** every player's augments at the start of the fight (combat ones change it) */
  augments?: Record<number, string[]>;
  /** the match's variant (picks the boss of a boss round) */
  variant?: number;
}
