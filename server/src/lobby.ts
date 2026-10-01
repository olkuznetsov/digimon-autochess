import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";
import { cleanName, cleanUnits, type BoardUnit } from "./util";
import {
  applyOutcomes,
  carouselEnd,
  carouselGroups,
  carouselItems,
  carouselTurn,
  planRound,
  poolLeft,
  ratingDelta,
  surrender,
  CAROUSEL_WAIT_MS,
  MAX_PLAYERS,
  POOL_COPIES,
  START_HP,
  type Carousel,
  type LobbyFight,
  type LobbySnapshot,
  type Outcome,
  type RoundPlan,
  type Standing,
} from "../../src/game/lobby";
import { isCarouselRound } from "../../src/game/tuning";
import { FORMS } from "../../src/game/creatures";
import { AUGMENTS, MAX_AUGMENTS } from "../../src/game/augments";

/**
 * A lobby for 2–8 players, one Durable Object per room code. Players gather in
 * the lobby stage and the host starts the match. Every round:
 *  1. players lock in their boards — offline players don't hold the round up
 *     (their last board plays), and a deadline covers anyone AFK;
 *  2. the room broadcasts every board with the round's pairings;
 *  3. every client simulates every fight of the round (the sim is deterministic)
 *     and reports the outcomes; the first report is applied — damage,
 *     eliminations, places, rating — and the next round is planned.
 * On the 3rd round of every stage the round opens with the carousel (an item
 * draft, lowest HP first) and waits for it. Clients report the rookie copies they
 * hold, so the room keeps the shared unit pool every shop rolls from.
 * The rules (pairings, ghosts, places, rating) live in src/game/lobby.ts, shared
 * with the clients. Clients are trusted, like the 1v1 room: a game among friends.
 */

interface Seat {
  seat: number;
  name: string;
  /** secret that lets a dropped player reclaim the seat */
  pid: string;
  /** leaderboard id for the rating; null = unrated (dev builds) */
  lb: string | null;
  inMatch: boolean;
  hp: number;
  alive: boolean;
  placement: number | null;
  ready: boolean;
}

interface Room {
  stage: LobbySnapshot["stage"];
  creator: number;
  match: number;
  seed: number;
  round: number;
  fighting: boolean;
  plan: RoundPlan | null;
  /** earlier fight rounds' plans, oldest first (the pairing rotation) */
  history: RoundPlan[];
  players: number;
  seats: Seat[];
  /** the applied report of the last resolved round (later reports are compared to it) */
  report: { round: number; hash: string } | null;
  /** rookie copies each player holds (the shared pool is what's left) */
  held: Record<number, Record<string, number>>;
  /** this round's item draft, on carousel rounds */
  carousel: Carousel | null;
  /** seats planning the current round (the carousel opens once everyone is in) */
  arrived: number[];
  /** when the current round began */
  roundAt: number;
  /** each player's augments this match */
  augments: Record<number, string[]>;
  /** made by the matchmaking queue: no host to press start */
  public: boolean;
  /** public room still waiting for its group: how many, and until when */
  auto: { expect: number; until: number } | null;
}

interface Attach {
  seat: number;
}

const ROOM_TTL_MS = 3 * 60 * 60 * 1000; // idle rooms are wiped after 3h
/** a public match waits this long for its group, then starts with whoever came (2+) */
const AUTO_JOIN_MS = 20_000;
/** once someone is locked in, the rest get this long (clients auto-ready at 40–50 s) */
const READY_DEADLINE_MS = 75 * 1000;
const SEAT_KEYS = Array.from({ length: MAX_PLAYERS }, (_, i) => [`ready:${i}`, `board:${i}`]).flat();

const newRoom = (): Room => ({
  stage: "lobby",
  creator: 0,
  match: 0,
  seed: 0,
  round: 0,
  fighting: false,
  plan: null,
  history: [],
  players: 0,
  seats: [],
  report: null,
  held: {},
  carousel: null,
  arrived: [],
  roundAt: 0,
  augments: {},
  public: false,
  auto: null,
});

const standingsOf = (room: Room): Standing[] =>
  room.seats.filter((s) => s.inMatch).map((s) => ({ seat: s.seat, hp: s.hp, alive: s.alive, placement: s.placement }));

const alivePlayers = (room: Room) => room.seats.filter((s) => s.inMatch && s.alive);

/** A report must give every player still standing exactly one sane outcome. */
function parseOutcomes(raw: unknown, alive: number[]): Outcome[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Outcome[] = [];
  for (const seat of alive) {
    const o = (raw as Record<string, unknown>[]).find((x) => Number(x?.seat) === seat);
    const damage = Number(o?.damage);
    if (!o || !Number.isInteger(damage) || damage < 0 || damage > 999) return null;
    out.push({ seat, damage, won: !!o.won });
  }
  return out;
}

export class Lobby extends DurableObject<Env> {
  private async load(): Promise<Room> {
    // rooms saved by an older build lack the newer fields
    return { ...newRoom(), ...(await this.ctx.storage.get<Room>("room")) };
  }

  private async save(room: Room) {
    await this.ctx.storage.put("room", room);
  }

  /** Seats with a live socket (`except`: one that is closing right now). */
  private online(except?: WebSocket): Set<number> {
    const on = new Set<number>();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const a = ws.deserializeAttachment() as Attach | null;
      if (a) on.add(a.seat);
    }
    return on;
  }

  /** The creator hosts while connected, otherwise the lowest connected seat. */
  private host(room: Room, online: Set<number>): number {
    if (online.has(room.creator)) return room.creator;
    return room.seats.map((s) => s.seat).find((s) => online.has(s)) ?? room.creator;
  }

  private snapshot(room: Room, except?: WebSocket): LobbySnapshot {
    const online = this.online(except);
    return {
      stage: room.stage,
      host: this.host(room, online),
      match: room.match,
      round: room.round,
      fighting: room.fighting,
      plan: room.plan,
      players: room.players,
      pool: poolLeft(room.held),
      carousel: room.carousel,
      public: room.public,
      expect: room.auto?.expect ?? 0,
      seats: room.seats.map((s) => ({
        seat: s.seat,
        name: s.name,
        online: online.has(s.seat),
        inMatch: s.inMatch,
        hp: Math.max(0, s.hp),
        alive: s.alive,
        placement: s.placement,
        ready: s.ready,
        augments: room.augments[s.seat] ?? [],
      })),
    };
  }

  private broadcast(msg: unknown, exceptSeat?: number) {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attach | null;
      if (!a || a.seat === exceptSeat) continue;
      try {
        ws.send(data);
      } catch {
        /* stale socket */
      }
    }
  }

  /** One alarm serves three timers: the idle-room TTL, the ready deadline and the
   *  carousel's next step (open / close). */
  private async schedule(opts: { ttl?: boolean; deadline?: number | null; tick?: number | null }) {
    if (opts.ttl) await this.ctx.storage.put("ttlAt", Date.now() + ROOM_TTL_MS);
    for (const key of ["deadline", "tick"] as const) {
      const v = opts[key];
      if (v === undefined) continue;
      if (v === null) await this.ctx.storage.delete(key);
      else await this.ctx.storage.put(key, v);
    }
    const ttlAt = (await this.ctx.storage.get<number>("ttlAt")) ?? Date.now() + ROOM_TTL_MS;
    const deadline = await this.ctx.storage.get<number>("deadline");
    const tick = await this.ctx.storage.get<number>("tick");
    await this.ctx.storage.setAlarm(Math.min(ttlAt, deadline ?? Infinity, tick ?? Infinity));
  }

  /** The matchmaking queue opens a public room for a group of `expect` players
   *  (RPC). False if the code is taken — the queue then picks another. */
  async setup(opts: { expect: number }): Promise<boolean> {
    const room = await this.load();
    if (room.stage !== "lobby" || room.seats.length > 0 || room.public) return false;
    room.public = true;
    room.auto = { expect: Math.max(2, Math.min(MAX_PLAYERS, Math.floor(opts.expect))), until: Date.now() + AUTO_JOIN_MS };
    await this.save(room);
    await this.schedule({ ttl: true, tick: room.auto.until });
    return true;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const url = new URL(request.url);
    const room = await this.load();
    const name = cleanName(url.searchParams.get("name"));
    const pid = url.searchParams.get("pid") ?? "";
    const want = Number(url.searchParams.get("seat"));
    const lb = url.searchParams.get("rated") === "1" ? (url.searchParams.get("lb") ?? "").slice(0, 40) || null : null;
    const online = this.online();

    let seat = pid ? room.seats.find((s) => s.seat === want && s.pid === pid) : undefined;
    if (seat) {
      // reclaiming a seat after a drop: retire the old socket (phones leave half-dead ones)
      for (const ws of this.ctx.getWebSockets()) {
        if ((ws.deserializeAttachment() as Attach | null)?.seat !== seat.seat) continue;
        ws.serializeAttachment(null);
        try {
          ws.close(4000, "replaced");
        } catch {
          /* already closed */
        }
      }
    } else {
      if (room.stage !== "lobby") return new Response("match in progress", { status: 409 });
      if (room.seats.length >= MAX_PLAYERS) {
        // a full lobby makes room by dropping someone who already left
        const gone = room.seats.find((s) => !online.has(s.seat));
        if (!gone) return new Response("lobby full", { status: 409 });
        room.seats = room.seats.filter((s) => s !== gone);
      }
      let n = 0;
      while (room.seats.some((s) => s.seat === n)) n++;
      seat = { seat: n, name, pid: crypto.randomUUID(), lb, inMatch: false, hp: START_HP, alive: true, placement: null, ready: false };
      if (!room.seats.some((s) => online.has(s.seat))) room.creator = n;
      room.seats = [...room.seats, seat].sort((a, b) => a.seat - b.seat);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ seat: seat.seat } satisfies Attach);
    await this.save(room);
    await this.schedule({ ttl: true });

    const lastFight = room.stage === "match" ? await this.ctx.storage.get<LobbyFight>("lastFight") : undefined;
    server.send(
      JSON.stringify({ t: "joined", seat: seat.seat, pid: seat.pid, snap: this.snapshot(room), lastFight, boards: await this.liveBoards(room) }),
    );
    this.broadcast({ t: "roster", snap: this.snapshot(room) }, seat.seat);
    // a public match starts once its whole group is in
    if (room.auto && room.stage === "lobby" && this.online().size >= room.auto.expect) await this.startMatch(room);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Everyone's latest arrangement (scouting), for a player (re)joining mid-match. */
  private async liveBoards(room: Room): Promise<Record<number, BoardUnit[]>> {
    const out: Record<number, BoardUnit[]> = {};
    if (room.stage === "lobby") return out;
    const got = await this.ctx.storage.get<BoardUnit[]>(room.seats.map((s) => `board:${s.seat}`));
    for (const s of room.seats) {
      const b = got.get(`board:${s.seat}`);
      if (b) out[s.seat] = b;
    }
    return out;
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string" || message.length > 20_000) return;
    const a = ws.deserializeAttachment() as Attach | null;
    if (!a) return;
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(message);
    } catch {
      return;
    }
    const room = await this.load();
    const me = room.seats.find((s) => s.seat === a.seat);
    if (!me) return;
    if (m.t === "start") await this.start(room, me);
    else if (m.t === "ready") await this.ready(room, me, m);
    else if (m.t === "board") await this.board(room, me, m);
    else if (m.t === "report") await this.report(room, m);
    else if (m.t === "surrender") await this.giveUp(room, me);
    else if (m.t === "leave") await this.leave(room, me, ws);
    else if (m.t === "held") await this.hold(room, me, m);
    else if (m.t === "arrived") await this.arrive(room, me, m);
    else if (m.t === "pick") await this.pick(room, me, m);
    else if (m.t === "augment") await this.augment(room, me, m);
  }

  private async start(room: Room, me: Seat) {
    if (room.stage === "match" || me.seat !== this.host(room, this.online())) return;
    await this.startMatch(room);
  }

  private async startMatch(room: Room) {
    const online = this.online();
    const players = room.seats.filter((s) => online.has(s.seat));
    if (players.length < 2) return;
    room.auto = null;
    // whoever is gone by now sits this one out
    room.seats = players.map((s) => ({ ...s, inMatch: true, hp: START_HP, alive: true, placement: null, ready: false }));
    room.stage = "match";
    room.match++;
    room.seed = Math.floor(Math.random() * 2 ** 31);
    room.round = 1;
    room.fighting = false;
    room.history = [];
    room.players = players.length;
    room.report = null;
    room.held = {};
    room.augments = {};
    room.plan = planRound(players.map((s) => s.seat), 1, [], room.seed);
    this.beginRound(room);
    await this.ctx.storage.delete([...SEAT_KEYS, "lastFight"]);
    await this.save(room);
    await this.schedule({ ttl: true, deadline: null, tick: null });
    this.broadcast({ t: "started", snap: this.snapshot(room) });
  }

  private async ready(room: Room, me: Seat, m: Record<string, unknown>) {
    if (room.stage !== "match" || room.fighting || !me.inMatch || !me.alive || m.round !== room.round) return;
    const board = cleanUnits(m.board) ?? [];
    await this.ctx.storage.put({ [`ready:${me.seat}`]: board, [`board:${me.seat}`]: board });
    me.ready = true;
    await this.save(room);
    await this.schedule({ ttl: true });
    this.broadcast({ t: "ready", seat: me.seat, round: room.round });
    await this.maybeFight(room);
  }

  /** Live scouting: keep the latest arrangement and show it to everyone else. */
  private async board(room: Room, me: Seat, m: Record<string, unknown>) {
    if (room.stage !== "match" || !me.alive) return;
    const board = cleanUnits(m.board);
    if (!board) return;
    await this.ctx.storage.put(`board:${me.seat}`, board);
    this.broadcast({ t: "board", seat: me.seat, board }, me.seat);
  }

  /** Fight once every connected player still standing is locked in (offline
   *  players' last boards play); otherwise start the clock on the rest. */
  private async maybeFight(room: Room, online = this.online()) {
    if (room.stage !== "match" || room.fighting) return;
    if (room.carousel && !room.carousel.done) return; // the draft comes first
    const alive = alivePlayers(room);
    if (!alive.some((s) => s.ready)) return;
    if (alive.every((s) => s.ready || !online.has(s.seat))) return this.startFight(room);
    if (!(await this.ctx.storage.get("deadline"))) await this.schedule({ deadline: Date.now() + READY_DEADLINE_MS });
  }

  private async startFight(room: Room) {
    const alive = alivePlayers(room);
    const got = await this.ctx.storage.get<BoardUnit[]>(alive.flatMap((s) => [`ready:${s.seat}`, `board:${s.seat}`]));
    const boards: LobbyFight["boards"] = {};
    for (const s of alive) boards[s.seat] = got.get(`ready:${s.seat}`) ?? got.get(`board:${s.seat}`) ?? [];
    const fight: LobbyFight = {
      match: room.match,
      round: room.round,
      plan: room.plan ?? { round: room.round, pairs: [], ghost: null },
      boards,
      augments: Object.fromEntries(alive.map((s) => [s.seat, room.augments[s.seat] ?? []])),
    };
    room.fighting = true;
    for (const s of room.seats) s.ready = false;
    await this.ctx.storage.delete(alive.map((s) => `ready:${s.seat}`));
    await this.ctx.storage.put("lastFight", fight);
    await this.save(room);
    await this.schedule({ deadline: null });
    this.broadcast({ t: "fight", ...fight });
  }

  /** Copy new standings into the seats; returns the players who just got a place. */
  private writeStandings(room: Room, standings: Standing[]): Seat[] {
    const placed: Seat[] = [];
    for (const st of standings) {
      const s = room.seats.find((x) => x.seat === st.seat);
      if (!s) continue;
      if (s.placement === null && st.placement !== null) placed.push(s);
      if (s.alive && !st.alive) delete room.held[s.seat]; // their copies go back to the pool
      s.hp = st.hp;
      s.alive = st.alive;
      s.placement = st.placement;
    }
    return placed;
  }

  private async report(room: Room, m: Record<string, unknown>) {
    const round = Number(m.round);
    const hash = String(m.hash ?? "").slice(0, 16);
    if (room.report?.round === round && !(room.fighting && room.round === round)) {
      // a later report of a round already applied: just compare
      if (hash !== room.report.hash) console.warn(`[lobby] desync in round ${round}: ${room.report.hash} vs ${hash}`);
      return;
    }
    if (room.stage !== "match" || !room.fighting || round !== room.round || Number(m.match) !== room.match) return;
    const outcomes = parseOutcomes(m.results, alivePlayers(room).map((s) => s.seat));
    if (!outcomes) return;

    const r = applyOutcomes(standingsOf(room), outcomes);
    const placed = this.writeStandings(room, r.standings);
    if (room.plan && (room.plan.pairs.length > 0 || room.plan.ghost)) room.history.push(room.plan);
    room.report = { round, hash };
    room.fighting = false;
    room.round++;
    if (r.over) {
      room.stage = "over";
      room.plan = null;
    } else {
      room.plan = planRound(alivePlayers(room).map((s) => s.seat), room.round, room.history, room.seed);
      this.beginRound(room);
    }
    await this.save(room);
    await this.schedule({ ttl: true, tick: room.carousel ? room.roundAt + CAROUSEL_WAIT_MS : null });
    this.broadcast({ t: "standings", round, eliminated: r.eliminated, snap: this.snapshot(room) });
    await this.rate(room, placed);
  }

  private async giveUp(room: Room, me: Seat) {
    if (room.stage !== "match" || !me.inMatch || !me.alive) return;
    const r = surrender(standingsOf(room), me.seat);
    const placed = this.writeStandings(room, r.standings);
    me.ready = false;
    if (r.over) {
      room.stage = "over";
      room.plan = null;
      room.fighting = false;
    } else if (!room.fighting) {
      // this round's pairs included them: plan it again
      room.plan = planRound(alivePlayers(room).map((s) => s.seat), room.round, room.history, room.seed);
    }
    await this.ctx.storage.delete(`ready:${me.seat}`);
    await this.save(room);
    this.broadcast({ t: "standings", round: null, eliminated: r.eliminated, snap: this.snapshot(room) });
    await this.advanceCarousel(room); // they may have been the last one it waited for
    await this.maybeFight(room);
    await this.rate(room, placed);
  }

  private async leave(room: Room, me: Seat, ws: WebSocket) {
    if (room.stage === "match" && me.inMatch && me.alive) {
      await this.giveUp(room, me);
      room = await this.load();
    }
    if (room.stage === "lobby" || !me.inMatch) {
      room.seats = room.seats.filter((s) => s.seat !== me.seat);
      await this.save(room);
    }
    ws.serializeAttachment(null);
    try {
      ws.close(1000, "left");
    } catch {
      /* already closed */
    }
    this.broadcast({ t: "roster", snap: this.snapshot(room, ws) });
  }

  /** A new round's planning begins: on carousel rounds, set up the item draft. */
  private beginRound(room: Room) {
    room.arrived = [];
    room.roundAt = Date.now();
    const alive = alivePlayers(room);
    room.carousel = isCarouselRound(room.round)
      ? {
          round: room.round,
          items: carouselItems(room.round, alive.length, room.seed),
          taken: {},
          groups: carouselGroups(standingsOf(room), room.round, room.seed),
          opensAt: 0,
          done: false,
        }
      : null;
  }

  /** An augment pick: public, and the room's record is what every fight uses. */
  private async augment(room: Room, me: Seat, m: Record<string, unknown>) {
    const id = String(m.id ?? "");
    const mine = room.augments[me.seat] ?? [];
    if (room.stage !== "match" || !me.alive || !AUGMENTS[id] || mine.includes(id) || mine.length >= MAX_AUGMENTS) return;
    room.augments[me.seat] = [...mine, id];
    await this.save(room);
    this.broadcast({ t: "roster", snap: this.snapshot(room) });
  }

  /** Shared pool: the rookie copies a player holds (bench and board). */
  private async hold(room: Room, me: Seat, m: Record<string, unknown>) {
    if (room.stage !== "match" || !me.inMatch || !me.alive || !m.counts || typeof m.counts !== "object") return;
    const counts: Record<string, number> = {};
    for (const [id, n] of Object.entries(m.counts as Record<string, unknown>)) {
      const form = FORMS[id];
      const max = form && form.stage === 1 ? (POOL_COPIES[form.cost ?? 1] ?? 18) : 0;
      const v = Math.floor(Number(n));
      if (max && v > 0) counts[id] = Math.min(max, v);
    }
    if (JSON.stringify(counts) === JSON.stringify(room.held[me.seat] ?? {})) return;
    room.held[me.seat] = counts;
    await this.save(room);
    this.broadcast({ t: "roster", snap: this.snapshot(room) });
  }

  /** A player is planning the current round; the carousel opens once everyone is. */
  private async arrive(room: Room, me: Seat, m: Record<string, unknown>) {
    if (room.stage !== "match" || !me.alive || m.round !== room.round || room.arrived.includes(me.seat)) return;
    room.arrived.push(me.seat);
    await this.save(room);
    await this.advanceCarousel(room);
  }

  /** Move the draft on when nobody holds it up any more: open it once every
   *  connected player still standing is planning; finish it once they all picked. */
  private async advanceCarousel(room: Room, online = this.online()) {
    const c = room.carousel;
    if (room.stage !== "match" || !c || c.done) return;
    const alive = alivePlayers(room);
    if (!c.opensAt) {
      if (!alive.some((s) => online.has(s.seat) && !room.arrived.includes(s.seat))) await this.openCarousel(room);
    } else if (alive.every((s) => Object.values(c.taken).includes(s.seat))) {
      c.done = true;
      await this.save(room);
      await this.schedule({ tick: null });
      this.broadcast({ t: "roster", snap: this.snapshot(room) });
    }
  }

  private async openCarousel(room: Room) {
    const c = room.carousel!;
    c.opensAt = Date.now() + 1500; // a beat to read the order
    await this.save(room);
    await this.schedule({ tick: carouselEnd(c) });
    this.broadcast({ t: "roster", snap: this.snapshot(room) });
  }

  private async pick(room: Room, me: Seat, m: Record<string, unknown>) {
    const c = room.carousel;
    const i = Number(m.index);
    if (room.stage !== "match" || !me.alive || !c || c.done || !Number.isInteger(i) || i < 0 || i >= c.items.length) return;
    if (c.taken[i] !== undefined || Object.values(c.taken).includes(me.seat) || Date.now() < carouselTurn(c, me.seat)) return;
    c.taken[i] = me.seat;
    await this.save(room);
    this.broadcast({ t: "roster", snap: this.snapshot(room) });
    await this.advanceCarousel(room);
    await this.maybeFight(room);
  }

  /** Time's up: whoever hasn't picked gets the first free item, in pick order. */
  private async closeCarousel(room: Room) {
    const c = room.carousel!;
    const alive = new Set(alivePlayers(room).map((s) => s.seat));
    for (const seat of c.groups.flat()) {
      if (!alive.has(seat) || Object.values(c.taken).includes(seat)) continue;
      const free = c.items.findIndex((_, i) => c.taken[i] === undefined);
      if (free >= 0) c.taken[free] = seat;
    }
    c.done = true;
    await this.save(room);
    this.broadcast({ t: "roster", snap: this.snapshot(room) });
    await this.maybeFight(room);
  }

  /** Placed players' rating goes straight to the leaderboard (rated players only). */
  private async rate(room: Room, placed: Seat[]) {
    const lb = this.env.LB.getByName("global");
    for (const s of placed) {
      if (!s.lb || s.placement === null) continue;
      try {
        await lb.rate({ id: s.lb, name: s.name, delta: ratingDelta(room.players, s.placement), win: s.placement === 1 });
      } catch (e) {
        console.warn("[lobby] rating failed", e);
      }
    }
  }

  async webSocketClose(ws: WebSocket) {
    // answer the close frame: until we do, the browser sits in the closing
    // handshake and only then fires "close" and starts reconnecting
    try {
      ws.close(1000, "closed");
    } catch {
      /* already closed */
    }
    if (!ws.deserializeAttachment()) return; // retired (replaced / left) — already handled
    const room = await this.load();
    this.broadcast({ t: "roster", snap: this.snapshot(room, ws) });
    // an offline player doesn't hold the round up: their last board plays
    if (room.stage === "match") {
      await this.advanceCarousel(room, this.online(ws));
      await this.maybeFight(room, this.online(ws));
    }
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }

  async alarm() {
    const deadline = await this.ctx.storage.get<number>("deadline");
    if (deadline && Date.now() >= deadline - 50) {
      await this.ctx.storage.delete("deadline");
      const room = await this.load();
      // AFK players play their last board
      if (room.stage === "match" && !room.fighting) await this.startFight(room);
      else await this.schedule({});
      return;
    }
    const tick = await this.ctx.storage.get<number>("tick");
    if (tick && Date.now() >= tick - 50) {
      await this.ctx.storage.delete("tick");
      const room = await this.load();
      if (room.stage === "lobby" && room.auto) {
        // the group didn't all make it: play with whoever came, or send a lone player back
        if (this.online().size >= 2) await this.startMatch(room);
        else {
          room.auto = null;
          await this.save(room);
          this.broadcast({ t: "requeue" });
        }
        await this.schedule({});
        return;
      }
      const c = room.carousel;
      if (room.stage === "match" && c && !c.done) {
        // slow fights don't hold the draft forever; then the clock runs out on picks
        if (!c.opensAt) await this.openCarousel(room);
        else if (Date.now() >= carouselEnd(c) - 50) await this.closeCarousel(room);
        else await this.schedule({ tick: carouselEnd(c) });
      }
      await this.schedule({});
      return;
    }
    const ttlAt = await this.ctx.storage.get<number>("ttlAt");
    if (ttlAt && Date.now() < ttlAt - 1000) {
      await this.schedule({});
      return;
    }
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(1000, "room expired");
      } catch {
        /* already gone */
      }
    }
    await this.ctx.storage.deleteAll();
  }
}
