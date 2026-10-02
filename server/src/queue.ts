import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";
import { cleanName, outdatedSocket } from "./util";
import { RULES_VERSION } from "../../src/game/rules-version";
import { MAX_PLAYERS } from "../../src/game/lobby";

/**
 * Public matchmaking (one instance, "global"): players wait here over a WebSocket
 * until a lobby forms — eight at once, or whoever is waiting once the first of them
 * has waited GATHER_MS (two at least). The group gets a fresh public room code; the
 * room (src/lobby.ts) starts by itself once they are in.
 */

const GATHER_MS = 20_000;
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

interface Waiting {
  name: string;
  at: number;
}

export class Matchmaker extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const url = new URL(request.url);
    // a group plays one set of rules: this build's (an older tab reloads first)
    if (url.searchParams.get("v") !== RULES_VERSION) return outdatedSocket(this.ctx);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ name: cleanName(url.searchParams.get("name")), at: Date.now() } satisfies Waiting);
    await this.matchOrWait();
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Everyone still waiting, longest first. */
  private waiting() {
    return this.ctx
      .getWebSockets()
      .map((ws) => ({ ws, w: ws.deserializeAttachment() as Waiting | null }))
      .filter((x): x is { ws: WebSocket; w: Waiting } => !!x.w)
      .sort((a, b) => a.w.at - b.w.at);
  }

  private tell(queue: { ws: WebSocket }[], msg: unknown) {
    const data = JSON.stringify(msg);
    for (const { ws } of queue) {
      try {
        ws.send(data);
      } catch {
        /* stale socket */
      }
    }
  }

  private async matchOrWait() {
    let queue = this.waiting();
    while (queue.length >= MAX_PLAYERS || (queue.length >= 2 && Date.now() - queue[0].w.at >= GATHER_MS)) {
      const group = queue.slice(0, MAX_PLAYERS);
      // out of the queue first: a concurrent call must not match them again
      for (const { ws } of group) ws.serializeAttachment(null);
      const code = await this.openRoom(group.length);
      for (const { ws } of group) {
        try {
          ws.send(JSON.stringify({ t: "match", code }));
          ws.close(1000, "matched");
        } catch {
          /* gone — the room starts without them */
        }
      }
      queue = this.waiting();
    }
    this.tell(queue, { t: "queue", waiting: queue.length, oldestAt: queue[0]?.w.at ?? 0, gatherMs: GATHER_MS });
    if (queue.length >= 2) await this.ctx.storage.setAlarm(queue[0].w.at + GATHER_MS);
  }

  /** A fresh public room for the group (a code nobody is using). */
  private async openRoom(players: number): Promise<string> {
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = "Q" + Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
      if (await this.env.LOBBY.getByName(code).setup({ expect: players })) return code;
    }
    throw new Error("no free room code");
  }

  async webSocketClose(ws: WebSocket) {
    try {
      ws.close(1000, "left the queue");
    } catch {
      /* already closed */
    }
    ws.serializeAttachment(null);
    const queue = this.waiting();
    this.tell(queue, { t: "queue", waiting: queue.length, oldestAt: queue[0]?.w.at ?? 0, gatherMs: GATHER_MS });
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }

  async alarm() {
    await this.matchOrWait();
  }
}
