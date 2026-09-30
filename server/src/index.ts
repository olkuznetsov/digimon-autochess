import { DurableObject } from "cloudflare:workers";
import { FORMS } from "../../src/game/creatures";
import { ITEMS } from "../../src/game/items";

/**
 * Multiplayer relay for Digimon Auto Chess: one MatchRoom Durable Object per
 * room code, two players (A = host, B = guest) over hibernatable WebSockets.
 *
 * The server is a thin, game-agnostic relay: it pairs players, syncs
 * ready-with-board per round, broadcasts "fight" when both are locked in, and
 * relays the HOST's battle result (host simulation is authoritative for
 * health). All game logic runs in the clients — fine for friendly matches.
 */

export interface Env {
  ROOM: DurableObjectNamespace<MatchRoom>;
  LB: DurableObjectNamespace<Leaderboard>;
  /** worker secret guarding /lb/admin/* (wrangler secret put ADMIN_KEY) */
  ADMIN_KEY?: string;
}

/** Display names: printable, trimmed, collapsed whitespace, max 16. */
function cleanName(raw: unknown): string {
  const n = String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 16);
  return n || "Tamer";
}

/** A ghost board must be real forms on real player cells with real items. */
function cleanBoard(raw: unknown): string | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 9) return null;
  const units = [];
  for (const u of raw as Record<string, unknown>[]) {
    const formId = String(u?.formId ?? "");
    const col = Number(u?.col);
    const row = Number(u?.row);
    const items = Array.isArray(u?.items) ? (u.items as unknown[]).map(String) : [];
    if (!FORMS[formId]) return null;
    if (!Number.isInteger(col) || col < 0 || col > 5 || !Number.isInteger(row) || row < 0 || row > 2) return null;
    if (items.length > 2 || items.some((i) => !ITEMS[i])) return null;
    units.push({ uid: String(u?.uid ?? "").slice(0, 24), formId, col, row, items });
  }
  return JSON.stringify(units);
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
    await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);

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
      await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS); // keep active rooms alive
      this.broadcast({ t: "oppready", side: a.side, round: m.round }, a.side);
      const A = await this.ctx.storage.get<ReadyPayload>("ready:A");
      const B = await this.ctx.storage.get<ReadyPayload>("ready:B");
      if (A && B && A.round === B.round) {
        await this.ctx.storage.delete(["ready:A", "ready:B"]);
        const fight = { round: A.round, boards: { A: A.board, B: B.board } };
        await this.ctx.storage.put("lastFight", fight);
        this.broadcast({ t: "fight", ...fight });
      }
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
    }
  }

  async webSocketClose(ws: WebSocket) {
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
    });
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

  async top(): Promise<unknown[]> {
    return this.ctx.storage.sql
      .exec<{ id: string; name: string; best: number; wins: number; hasBoard: number }>(
        "SELECT id, name, best, wins, (board IS NOT NULL) AS hasBoard FROM lb ORDER BY best DESC, wins DESC, updated ASC LIMIT 50",
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
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", ...CORS } });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    const m = url.pathname.match(/^\/ws\/([A-Za-z0-9]{4,8})$/);
    if (m) {
      const stub = env.ROOM.getByName(m[1].toUpperCase());
      return stub.fetch(request);
    }

    const lb = env.LB.getByName("global");
    if (url.pathname === "/lb/top" && request.method === "GET") {
      return json(await lb.top());
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
