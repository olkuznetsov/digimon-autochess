import { DurableObject } from "cloudflare:workers";
import { cleanBoard, cleanName, LB_SEASON } from "./util";
import { Lobby } from "./lobby";
import { Matchmaker } from "./queue";
import { Account } from "./account";
import { accountIdFor, issueSession, readSession, verifyGoogleIdToken } from "./auth";

/**
 * Multiplayer server for Digimon Auto Chess (Cloudflare Worker + Durable Objects):
 * - Lobby (src/lobby.ts): rooms of 2–8 players, the current VS mode;
 * - Matchmaker (src/queue.ts): the public queue that forms lobbies;
 * - MatchRoom: the original 1v1 relay, kept for clients still running an older build;
 * - Leaderboard: best runs, VS wins, lobby rating and saved boards for ghost battles;
 * - Account (src/account.ts): a Google-signed-in tamer's synced game data.
 */

export { Lobby, Matchmaker, Account };

export interface Env {
  ROOM: DurableObjectNamespace<MatchRoom>;
  LOBBY: DurableObjectNamespace<Lobby>;
  QUEUE: DurableObjectNamespace<Matchmaker>;
  LB: DurableObjectNamespace<Leaderboard>;
  /** worker secret guarding /lb/admin/* (wrangler secret put ADMIN_KEY) */
  ADMIN_KEY?: string;
  ACCOUNT: DurableObjectNamespace<Account>;
  /** the game's Google OAuth client (not secret; wrangler.jsonc vars) */
  GOOGLE_CLIENT_ID?: string;
  /** signs session tokens (wrangler secret put SESSION_SECRET) */
  SESSION_SECRET?: string;
}

type Side = "A" | "B";
interface Attach {
  side: Side;
  name: string;
}
interface ReadyPayload {
  round: number;
  board: unknown;
}

const ROOM_TTL_MS = 3 * 60 * 60 * 1000; // idle rooms are wiped after 3h
/** once one player is ready, the other gets this long (clients auto-ready at 40–50 s;
 *  this covers AFK players and background tabs whose timers are throttled) */
const READY_DEADLINE_MS = 75 * 1000;

export class MatchRoom extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const url = new URL(request.url);
    const name = (url.searchParams.get("name") || "Tamer").slice(0, 16);
    const want = url.searchParams.get("side");

    // Sides are assigned by who's CONNECTED, so a dropped player can rejoin —
    // and a rejoining player asks for their old side so host/guest never swap.
    const taken = new Set(
      this.ctx.getWebSockets().map((w) => (w.deserializeAttachment() as Attach | null)?.side),
    );
    const side: Side | null =
      (want === "A" || want === "B") && !taken.has(want)
        ? want
        : !taken.has("A")
          ? "A"
          : !taken.has("B")
            ? "B"
            : null;
    if (!side) return new Response("room full", { status: 409 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ side, name } satisfies Attach);
    await this.ctx.storage.put(`name:${side}`, name);
    await this.schedule({ ttl: true });

    const players = await this.roster();
    // a rejoining client catches up on the fight/result it may have missed
    const lastFight = await this.ctx.storage.get("lastFight");
    const lastResult = await this.ctx.storage.get("lastResult");
    server.send(JSON.stringify({ t: "joined", side, players, lastFight, lastResult }));
    this.broadcast({ t: "peer", players }, side);
    return new Response(null, { status: 101, webSocket: client });
  }

  private async roster() {
    const online = this.ctx
      .getWebSockets()
      .map((w) => (w.deserializeAttachment() as Attach | null)?.side)
      .filter(Boolean);
    return {
      A: (await this.ctx.storage.get<string>("name:A")) ?? null,
      B: (await this.ctx.storage.get<string>("name:B")) ?? null,
      online,
    };
  }

  /** One alarm serves two timers: the idle-room TTL and the ready deadline. */
  private async schedule(opts: { ttl?: boolean; deadline?: number | null }) {
    if (opts.ttl) await this.ctx.storage.put("ttlAt", Date.now() + ROOM_TTL_MS);
    if (opts.deadline !== undefined) {
      if (opts.deadline === null) await this.ctx.storage.delete("deadline");
      else await this.ctx.storage.put("deadline", opts.deadline);
    }
    const ttlAt = (await this.ctx.storage.get<number>("ttlAt")) ?? Date.now() + ROOM_TTL_MS;
    const deadline = await this.ctx.storage.get<number>("deadline");
    await this.ctx.storage.setAlarm(deadline ? Math.min(deadline, ttlAt) : ttlAt);
  }

  /** Both boards are in (or the deadline passed): start the round's fight. */
  private async startFight(round: number) {
    const A = await this.ctx.storage.get<ReadyPayload>("ready:A");
    const B = await this.ctx.storage.get<ReadyPayload>("ready:B");
    const board = async (side: Side, ready?: ReadyPayload) =>
      ready?.board ?? (await this.ctx.storage.get(`lastBoard:${side}`)) ?? [];
    const fight = { round, boards: { A: await board("A", A), B: await board("B", B) } };
    await this.ctx.storage.delete(["ready:A", "ready:B"]);
    await this.ctx.storage.put("lastFight", fight);
    await this.schedule({ deadline: null });
    this.broadcast({ t: "fight", ...fight });
  }

  private broadcast(msg: unknown, exceptSide?: Side) {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attach | null;
      if (!a || a.side === exceptSide) continue;
      try {
        ws.send(data);
      } catch {
        /* stale socket */
      }
    }
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;
    const a = ws.deserializeAttachment() as Attach | null;
    if (!a) return;
    let m: { t?: string; round?: number; board?: unknown; winner?: string; damage?: number; hash?: string };
    try {
      m = JSON.parse(message);
    } catch {
      return;
    }

    if (m.t === "ready" && typeof m.round === "number") {
      await this.ctx.storage.put(`ready:${a.side}`, { round: m.round, board: m.board } satisfies ReadyPayload);
      await this.ctx.storage.put(`lastBoard:${a.side}`, m.board);
      this.broadcast({ t: "oppready", side: a.side, round: m.round }, a.side);
      const A = await this.ctx.storage.get<ReadyPayload>("ready:A");
      const B = await this.ctx.storage.get<ReadyPayload>("ready:B");
      if (A && B && A.round === B.round) {
        await this.schedule({ ttl: true });
        await this.startFight(A.round);
      } else {
        // the other player has READY_DEADLINE_MS to answer; the alarm fights for them after
        await this.ctx.storage.put("deadlineRound", m.round);
        await this.schedule({ ttl: true, deadline: Date.now() + READY_DEADLINE_MS });
      }
    } else if (m.t === "board") {
      // live scouting: keep the latest arrangement and show it to the opponent
      await this.ctx.storage.put(`lastBoard:${a.side}`, m.board);
      this.broadcast({ t: "board", side: a.side, board: m.board }, a.side);
    } else if (m.t === "result") {
      if (a.side !== "A") return; // host simulation is authoritative
      const result = {
        round: m.round,
        winner: m.winner,
        damage: m.damage,
        hash: typeof m.hash === "string" ? m.hash.slice(0, 16) : undefined,
      };
      await this.ctx.storage.put("lastResult", result);
      this.broadcast({ t: "result", ...result });
    } else if (m.t === "surrender") {
      this.broadcast({ t: "surrender", side: a.side });
    } else if (m.t === "rematch") {
      // both players asked: wipe the match state and start over in the same room
      await this.ctx.storage.put(`rematch:${a.side}`, true);
      const other: Side = a.side === "A" ? "B" : "A";
      if (await this.ctx.storage.get(`rematch:${other}`)) {
        await this.ctx.storage.delete(["rematch:A", "rematch:B", "ready:A", "ready:B", "lastFight", "lastResult", "lastBoard:A", "lastBoard:B"]);
        await this.schedule({ ttl: true, deadline: null });
        this.broadcast({ t: "rematch-go" });
      } else {
        this.broadcast({ t: "rematch-req", side: a.side }, a.side);
      }
    }
  }

  async webSocketClose(ws: WebSocket) {
    try {
      ws.close(1000, "closed"); // complete the closing handshake for the client
    } catch {
      /* already closed */
    }
    const a = ws.deserializeAttachment() as Attach | null;
    if (a) {
      await this.ctx.storage.delete(`ready:${a.side}`);
      this.broadcast({ t: "left", side: a.side }, a.side);
    }
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }

  async alarm() {
    const deadline = await this.ctx.storage.get<number>("deadline");
    if (deadline && Date.now() >= deadline - 50) {
      const round = await this.ctx.storage.get<number>("deadlineRound");
      if (typeof round === "number") await this.startFight(round);
      else await this.schedule({ deadline: null });
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

/** Global anonymous leaderboard + saved boards for ghost battles.
 *  One SQLite DO instance ("global"); identity = client-generated device id,
 *  display name chosen by the player. No accounts, no passwords. */
export class Leaderboard extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS lb (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          best INTEGER NOT NULL DEFAULT 0,
          wins INTEGER NOT NULL DEFAULT 0,
          board TEXT,
          updated INTEGER NOT NULL
        )
      `);
      // lobby rating (added with the 2–8 player lobby)
      const cols = this.ctx.storage.sql.exec<{ name: string }>("PRAGMA table_info(lb)").toArray();
      if (!cols.some((c) => c.name === "rating")) {
        this.ctx.storage.sql.exec("ALTER TABLE lb ADD COLUMN rating INTEGER NOT NULL DEFAULT 0");
      }
    });
  }

  /** A lobby placement (called by the Lobby room, never over HTTP): rating moves by
   *  `delta` (never below 0), a win also counts as a VS win. */
  async rate(e: { id: string; name: string; delta: number; win: boolean }) {
    const id = String(e.id).slice(0, 40);
    const name = cleanName(e.name);
    const delta = Math.max(-40, Math.min(40, Math.round(Number(e.delta) || 0)));
    const win = e.win ? 1 : 0;
    const row = this.ctx.storage.sql.exec<{ rating: number }>("SELECT rating FROM lb WHERE id = ?", id).toArray()[0];
    if (row) {
      this.ctx.storage.sql.exec(
        "UPDATE lb SET name=?, rating=MAX(0, rating + ?), wins=wins + ?, updated=? WHERE id=?",
        name, delta, win, Date.now(), id,
      );
    } else {
      this.ctx.storage.sql.exec(
        "INSERT INTO lb (id, name, best, wins, board, rating, updated) VALUES (?,?,0,?,NULL,?,?)",
        id, name, win, Math.max(0, delta), Date.now(),
      );
    }
  }

  async submit(e: { id: string; name: string; best?: number; winsDelta?: number; board?: unknown }) {
    const id = String(e.id).slice(0, 40);
    const name = cleanName(e.name);
    const best = Math.max(0, Math.min(999, Math.floor(Number(e.best) || 0)));
    const winsDelta = e.winsDelta === 1 ? 1 : 0;
    const board = e.board === undefined ? null : cleanBoard(e.board);
    const row = this.ctx.storage.sql
      .exec<{ best: number; wins: number }>("SELECT best, wins FROM lb WHERE id = ?", id)
      .toArray()[0];
    const newBest = Math.max(best, row?.best ?? 0);
    const newWins = (row?.wins ?? 0) + winsDelta;
    // keep the board of the strongest run (or the latest at equal best)
    const keepBoard = board !== null && best >= (row?.best ?? 0);
    if (row) {
      if (keepBoard) {
        this.ctx.storage.sql.exec(
          "UPDATE lb SET name=?, best=?, wins=?, board=?, updated=? WHERE id=?",
          name, newBest, newWins, board, Date.now(), id,
        );
      } else {
        this.ctx.storage.sql.exec(
          "UPDATE lb SET name=?, best=?, wins=?, updated=? WHERE id=?",
          name, newBest, newWins, Date.now(), id,
        );
      }
    } else {
      this.ctx.storage.sql.exec(
        "INSERT INTO lb (id, name, best, wins, board, updated) VALUES (?,?,?,?,?,?)",
        id, name, newBest, newWins, board, Date.now(),
      );
    }
    return { best: newBest, wins: newWins };
  }

  async remove(ids: string[]): Promise<number> {
    let n = 0;
    for (const id of ids.slice(0, 50)) {
      n += this.ctx.storage.sql.exec("DELETE FROM lb WHERE id = ?", String(id).slice(0, 40)).rowsWritten;
    }
    return n;
  }

  async top(by: "best" | "rating" = "best"): Promise<unknown[]> {
    const order = by === "rating" ? "rating DESC, wins DESC, updated ASC" : "best DESC, wins DESC, updated ASC";
    return this.ctx.storage.sql
      .exec<{ id: string; name: string; best: number; wins: number; rating: number; hasBoard: number }>(
        `SELECT id, name, best, wins, rating, (board IS NOT NULL) AS hasBoard FROM lb ${by === "rating" ? "WHERE rating > 0 OR wins > 0" : ""} ORDER BY ${order} LIMIT 50`,
      )
      .toArray();
  }

  async board(id: string): Promise<string | null> {
    const row = this.ctx.storage.sql
      .exec<{ board: string | null }>("SELECT board FROM lb WHERE id = ?", String(id).slice(0, 40))
      .toArray()[0];
    return row?.board ?? null;
  }
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", ...CORS } });

/** a synced save can't grow past this (the client's game data is a few KB) */
const MAX_ACCOUNT_DATA = 256 * 1024;

/**
 * Accounts — Google sign-in, then the tamer's data on every device:
 * - POST /account/google {credential}: Google's ID token in, a session token out, with the
 *   account's data (null for a new account);
 * - GET /account/me: the account and its data;
 * - PUT /account/data {data, base, force?}: saves unless another device saved since `base`
 *   (409 with what's stored);
 * - DELETE /account: erases it.
 */
async function accountRoute(request: Request, env: Env, url: URL): Promise<Response> {
  if (!env.GOOGLE_CLIENT_ID || !env.SESSION_SECRET) return json({ error: "accounts are off" }, 503);
  const view = (id: string, googleName: string, data: string | null, updatedAt: number) => ({
    id: `a-${id}`,
    googleName,
    data: data ? JSON.parse(data) : null,
    updatedAt,
  });

  if (url.pathname === "/account/google" && request.method === "POST") {
    let body: { credential?: unknown };
    try {
      body = await request.json();
    } catch {
      return json({ error: "bad json" }, 400);
    }
    const user = await verifyGoogleIdToken(String(body?.credential ?? ""), env.GOOGLE_CLIENT_ID);
    if (!user) return json({ error: "sign-in failed" }, 401);
    const id = await accountIdFor(user.sub);
    const rec = await env.ACCOUNT.getByName(id).touch(cleanName(user.name));
    return json({ token: await issueSession(env.SESSION_SECRET, id), ...view(id, rec.googleName, rec.data, rec.updatedAt) });
  }

  const auth = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const id = await readSession(env.SESSION_SECRET, auth);
  if (!id) return json({ error: "signed out" }, 401);
  const stub = env.ACCOUNT.getByName(id);

  if (url.pathname === "/account/me" && request.method === "GET") {
    const rec = await stub.load();
    return rec ? json(view(id, rec.googleName, rec.data, rec.updatedAt)) : json({ error: "no such account" }, 401);
  }
  if (url.pathname === "/account/data" && request.method === "PUT") {
    const text = await request.text();
    if (text.length > MAX_ACCOUNT_DATA) return json({ error: "too big" }, 413);
    let body: { data?: unknown; base?: unknown; force?: unknown };
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: "bad json" }, 400);
    }
    if (!body?.data || typeof body.data !== "object") return json({ error: "no data" }, 400);
    const r = await stub.save(JSON.stringify(body.data), Number(body.base) || 0, body.force === true);
    if (r.ok) return json({ updatedAt: r.updatedAt });
    return r.updatedAt
      ? json({ error: "newer on the server", updatedAt: r.updatedAt, data: r.data ? JSON.parse(r.data) : null }, 409)
      : json({ error: "no such account" }, 401);
  }
  if (url.pathname === "/account" && request.method === "DELETE") {
    await stub.erase();
    return json({ deleted: true });
  }
  return json({ error: "not found" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    const lm = url.pathname.match(/^\/lobby\/([A-Za-z0-9]{4,8})$/);
    if (lm) return env.LOBBY.getByName(lm[1].toUpperCase()).fetch(request);
    if (url.pathname === "/queue") return env.QUEUE.getByName("global").fetch(request);

    const m = url.pathname.match(/^\/ws\/([A-Za-z0-9]{4,8})$/);
    if (m) {
      const stub = env.ROOM.getByName(m[1].toUpperCase());
      return stub.fetch(request);
    }

    if (url.pathname.startsWith("/account")) return accountRoute(request, env, url);

    const lb = env.LB.getByName(LB_SEASON);
    if (url.pathname === "/lb/top" && request.method === "GET") {
      return json(await lb.top(url.searchParams.get("by") === "rating" ? "rating" : "best"));
    }
    if (url.pathname === "/lb/submit" && request.method === "POST") {
      let body: { id?: string };
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad json" }, 400);
      }
      if (!body?.id) return json({ error: "id required" }, 400);
      return json(await lb.submit(body as Parameters<Leaderboard["submit"]>[0]));
    }
    if (url.pathname === "/lb/admin/delete" && request.method === "POST") {
      const key = request.headers.get("x-admin-key") ?? "";
      if (!env.ADMIN_KEY || key.length !== env.ADMIN_KEY.length || key !== env.ADMIN_KEY) {
        return json({ error: "forbidden" }, 403);
      }
      let body: { ids?: unknown };
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad json" }, 400);
      }
      const ids = Array.isArray(body?.ids) ? body.ids.map(String) : [];
      return json({ deleted: await lb.remove(ids) });
    }
    const bm = url.pathname.match(/^\/lb\/board\/([\w-]{1,40})$/);
    if (bm && request.method === "GET") {
      const b = await lb.board(bm[1]);
      return b ? new Response(b, { headers: { "content-type": "application/json", ...CORS } }) : json({ error: "no board" }, 404);
    }

    return new Response("digimon-autochess multiplayer relay ok", { status: 200, headers: CORS });
  },
};
