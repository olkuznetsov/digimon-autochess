import { useGame } from "../game/store";
import { net } from "./bus";

/** WebSocket client for VS-friend matches (MatchRoom Durable Object relay). */

const WS_BASE = "wss://digimon-autochess-mp.askuznetsov6996.workers.dev";

let ws: WebSocket | null = null;
let closedByUs = false;

export function pvpConnect(code: string, name: string, onError?: (why: string) => void) {
  pvpClose();
  closedByUs = false;
  const socket = new WebSocket(`${WS_BASE}/ws/${code}?name=${encodeURIComponent(name)}`);
  ws = socket;
  net.send = (o) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(o));
  };

  socket.onmessage = (e) => {
    let m: { t: string } & Record<string, never | unknown>;
    try {
      m = JSON.parse(String(e.data));
    } catch {
      return;
    }
    const g = useGame.getState();
    switch (m.t) {
      case "joined":
        g.pvpJoined(code, m.side as "A" | "B", m.players as { A: string | null; B: string | null; online: string[] });
        break;
      case "peer":
        g.pvpPeer(m.players as { A: string | null; B: string | null; online: string[] });
        break;
      case "oppready":
        g.pvpOppReady();
        break;
      case "fight":
        g.pvpFight(m.boards as Record<"A" | "B", import("../game/store").PvpBoardUnit[]>);
        break;
      case "result":
        g.pvpResult(m.winner as "A" | "B" | "draw", (m.damage as number) ?? 4);
        break;
      case "left":
        g.pvpLeft();
        break;
    }
  };

  socket.onclose = () => {
    if (closedByUs || ws !== socket) return;
    const g = useGame.getState();
    if (g.pvp) {
      if (g.pvp.side) g.pvpLeft(); // joined then dropped
      else onError?.("connection lost");
    } else {
      onError?.("could not join (room full or offline?)");
    }
  };
}

export function pvpClose() {
  closedByUs = true;
  net.send = null;
  try {
    ws?.close();
  } catch {
    /* already closed */
  }
  ws = null;
}
