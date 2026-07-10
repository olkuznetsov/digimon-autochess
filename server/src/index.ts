import { DurableObject } from "cloudflare:workers";

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

    // Sides are assigned by who's CONNECTED, so a dropped player can rejoin.
    const taken = new Set(
      this.ctx.getWebSockets().map((w) => (w.deserializeAttachment() as Attach | null)?.side),
    );
    const side: Side | null = !taken.has("A") ? "A" : !taken.has("B") ? "B" : null;
    if (!side) return new Response("room full", { status: 409 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ side, name } satisfies Attach);
    await this.ctx.storage.put(`name:${side}`, name);
    await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);

    const players = await this.roster();
    server.send(JSON.stringify({ t: "joined", side, players }));
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
    let m: { t?: string; round?: number; board?: unknown; winner?: string; damage?: number };
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
        this.broadcast({ t: "fight", round: A.round, boards: { A: A.board, B: B.board } });
      }
    } else if (m.t === "result") {
      if (a.side !== "A") return; // host simulation is authoritative
      this.broadcast({ t: "result", round: m.round, winner: m.winner, damage: m.damage });
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/ws\/([A-Za-z0-9]{4,8})$/);
    if (m) {
      const stub = env.ROOM.getByName(m[1].toUpperCase());
      return stub.fetch(request);
    }
    return new Response("digimon-autochess multiplayer relay ok", {
      status: 200,
      headers: { "access-control-allow-origin": "*" },
    });
  },
};
