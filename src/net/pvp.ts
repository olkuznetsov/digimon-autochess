import { useGame, type PvpBoardUnit } from "../game/store";
import { net } from "./bus";

/** WebSocket client for VS-friend matches (MatchRoom Durable Object relay).
 *  Survives drops: phones kill sockets when the player switches apps (e.g. to
 *  send the room code), so we reconnect to the same side and resync from the
 *  room's last fight/result instead of ending the match. */

const WS_BASE = "wss://digimon-autochess-mp.askuznetsov6996.workers.dev";
/** how long a vanished opponent may take to come back before forfeiting */
const OPP_GRACE_MS = 45_000;
/** how long we keep trying to get back in ourselves */
const SELF_RETRY_MS = 120_000;

type Players = { A: string | null; B: string | null; online: string[] };
interface LastFight {
  round: number;
  boards: Record<"A" | "B", PvpBoardUnit[]>;
}
interface LastResult {
  round: number;
  winner: "A" | "B" | "draw";
  damage: number;
  hash?: string;
}

let ws: WebSocket | null = null;
let closedByUs = false;
let session: { code: string; name: string; onError?: (why: string) => void } | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 500;
let offlineSince = 0;
let oppGraceTimer: ReturnType<typeof setTimeout> | null = null;

function clearTimers() {
  if (retryTimer) clearTimeout(retryTimer);
  if (oppGraceTimer) clearTimeout(oppGraceTimer);
  retryTimer = oppGraceTimer = null;
}

function open() {
  if (!session) return;
  const { code, name, onError } = session;
  const side = useGame.getState().pvp?.side;
  const url = `${WS_BASE}/ws/${code}?name=${encodeURIComponent(name)}${side ? `&side=${side}` : ""}`;
  const socket = new WebSocket(url);
  ws = socket;
  net.send = (o) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(o));
  };

  socket.onmessage = (e) => {
    let m: { t: string } & Record<string, unknown>;
    try {
      m = JSON.parse(String(e.data));
    } catch {
      return;
    }
    const g = useGame.getState();
    switch (m.t) {
      case "joined": {
        retryDelay = 500;
        offlineSince = 0;
        const rejoin = !!g.pvp && g.pvp.code === code;
        g.pvpJoined(code, m.side as "A" | "B", m.players as Players, rejoin);
        if (rejoin) resync(m.lastFight as LastFight | undefined, m.lastResult as LastResult | undefined);
        break;
      }
      case "peer": {
        const players = m.players as Players;
        g.pvpPeer(players);
        const other = g.pvp?.side === "A" ? "B" : "A";
        if (players.online.includes(other) && oppGraceTimer) {
          clearTimeout(oppGraceTimer);
          oppGraceTimer = null;
        }
        break;
      }
      case "oppready":
        g.pvpOppReady();
        break;
      case "fight":
        g.pvpFight((m.boards as LastFight["boards"]) ?? { A: [], B: [] });
        break;
      case "result":
        g.pvpResult(
          m.winner as LastResult["winner"],
          (m.damage as number) ?? 4,
          m.hash as string | undefined,
          m.round as number | undefined,
        );
        break;
      case "surrender":
        g.pvpSurrendered(m.side as "A" | "B");
        break;
      case "left":
        g.pvpLeft();
        if (oppGraceTimer) clearTimeout(oppGraceTimer);
        oppGraceTimer = setTimeout(() => {
          oppGraceTimer = null;
          useGame.getState().pvpOpponentForfeit();
        }, OPP_GRACE_MS);
        break;
    }
  };

  socket.onclose = () => {
    if (closedByUs || ws !== socket) return;
    const g = useGame.getState();
    if (!g.pvp) {
      onError?.("could not join (room full or offline?)");
      session = null;
      return;
    }
    if (g.pvp.matchOver) return;
    // OUR connection dropped — this is not the opponent leaving. Reconnect.
    if (!offlineSince) offlineSince = Date.now();
    g.pvpSelfOffline(true);
    if (Date.now() - offlineSince > SELF_RETRY_MS) {
      g.pvpConnectionLost();
      return;
    }
    retryTimer = setTimeout(open, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 8000);
  };
}

/** After a rejoin, catch up on whatever the room did while we were away. */
function resync(lastFight?: LastFight, lastResult?: LastResult) {
  const g = useGame.getState();
  const pvp = g.pvp;
  if (!pvp) return;
  if (lastResult && lastResult.round === g.round && pvp.resultRound !== g.round) {
    g.pvpResult(lastResult.winner, lastResult.damage, lastResult.hash, lastResult.round);
    // missed the whole fight: jump to the result. Mid-fight: keep watching — our
    // (deterministic) sim reaches the same end on its own.
    if (g.phase === "prep") {
      useGame.setState({ phase: "result", result: lastResult.winner === pvp.side ? "win" : "lose" });
    }
    return;
  }
  if (lastFight && lastFight.round === g.round && g.phase === "prep" && pvp.myReady) {
    g.pvpFight(lastFight.boards); // the fight started without us — watch it from the top
    return;
  }
  if (g.phase === "prep" && pvp.myReady) g.pvpResendReady(); // the room forgot our ready on disconnect
}

export function pvpConnect(code: string, name: string, onError?: (why: string) => void) {
  pvpClose();
  closedByUs = false;
  retryDelay = 500;
  offlineSince = 0;
  session = { code, name, onError };
  open();
}

export function pvpClose() {
  closedByUs = true;
  clearTimers();
  session = null;
  net.send = null;
  try {
    ws?.close();
  } catch {
    /* already closed */
  }
  ws = null;
}

// dev-only: lets tests simulate a dropped connection (`window.__pvpSocket().close()`)
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __pvpSocket: () => WebSocket | null }).__pvpSocket = () => ws;
}

// Coming back to the tab (e.g. after sending the room code in a messenger):
// don't wait for the backoff timer.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !session || closedByUs) return;
    if (ws && ws.readyState <= WebSocket.OPEN) return;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    open();
  });
}
