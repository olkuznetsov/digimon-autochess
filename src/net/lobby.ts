import { useGame, wireBoard, pvpMe, type PvpBoardUnit } from "../game/store";
import { CLOSE_OUTDATED, heldCopies, type LobbyFight, type LobbySnapshot } from "../game/lobby";
import { RULES_VERSION } from "../game/rules-version";
import { net } from "./bus";
import { partnerForm, playerId } from "./leaderboard";
import { WORKER_WS } from "../channel";

/** WebSocket client for VS lobbies (2–8 players, the Lobby Durable Object).
 *  Survives drops: phones kill sockets when the player switches apps (e.g. to
 *  send the room code), so we reconnect to the same seat with its secret and
 *  catch up with the room instead of leaving the match. */

const WS_BASE = `${WORKER_WS}/lobby/`;
/** What a tab is told when the server runs other rules than it (an update went out). */
export const OUTDATED_MESSAGE = "The game was updated — reload the page to play VS.";

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I/L

/** A new room's code. */
export function randomCode() {
  return Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
}
/** how long we keep trying to get back in */
const SELF_RETRY_MS = 120_000;

let ws: WebSocket | null = null;
let closedByUs = false;
let session: { code: string; name: string; onError?: (why: string) => void } | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 500;
let offlineSince = 0;
/** dev builds: what we sent lately (tests compare clients' round reports) */
const sentLog: unknown[] = [];

/** Lobby places move the leaderboard rating; dev builds stay off it like solo scores
 *  (localStorage "dac-dev-submit" opts in deliberately). */
function rated(): boolean {
  if (!import.meta.env.DEV) return true;
  try {
    return !!localStorage.getItem("dac-dev-submit");
  } catch {
    return false;
  }
}

function open() {
  if (!session) return;
  const { code, name, onError } = session;
  const pvp = useGame.getState().pvp;
  const back = pvp && pvp.code === code ? `&seat=${pvp.seat}&pid=${encodeURIComponent(pvp.pid)}` : "";
  const url =
    `${WS_BASE}${code}?name=${encodeURIComponent(name)}&lb=${encodeURIComponent(playerId())}&partner=${encodeURIComponent(partnerForm() ?? "")}` +
    `&rated=${rated() ? 1 : 0}&v=${RULES_VERSION}${back}`;
  const socket = new WebSocket(url);
  ws = socket;
  /** The room runs other rules than this tab: retrying can't help, reloading does.
   *  It says so in a message, then closes (4001) — the message is acted on right
   *  away, since the closing handshake can take seconds. */
  const outdated = () => {
    if (ws !== socket) return;
    ws = null;
    session = null;
    try {
      socket.close();
    } catch {
      /* already closed */
    }
    const g = useGame.getState();
    if (g.pvp) g.pvpOutdated();
    else onError?.(OUTDATED_MESSAGE);
  };
  net.send = (o) => {
    if (import.meta.env.DEV) {
      sentLog.push(o);
      if (sentLog.length > 40) sentLog.shift();
    }
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
      case "joined":
        retryDelay = 500;
        offlineSince = 0;
        g.pvpJoined(
          code,
          m.seat as number,
          m.pid as string,
          m.snap as LobbySnapshot,
          (m.boards as Record<number, PvpBoardUnit[]>) ?? {},
          m.lastFight as LobbyFight | undefined,
        );
        break;
      case "roster":
        g.pvpSync(m.snap as LobbySnapshot, []);
        break;
      case "started":
        g.pvpStarted(m.snap as LobbySnapshot);
        break;
      case "ready":
        g.pvpSeatReady(m.seat as number, m.round as number);
        break;
      case "board":
        g.pvpBoard(m.seat as number, (m.board as PvpBoardUnit[]) ?? []);
        break;
      case "fight":
        g.pvpFight(m as unknown as LobbyFight);
        break;
      case "standings":
        g.pvpSync(m.snap as LobbySnapshot, (m.eliminated as number[]) ?? []);
        break;
      case "outdated":
        outdated();
        break;
      case "requeue":
        // a public match whose group never showed up: back to the menu to search again
        onError?.("Not enough tamers showed up — search again.");
        lobbyLeave();
        break;
    }
  };

  socket.onclose = (e) => {
    if (closedByUs || ws !== socket) return;
    if (e.code === CLOSE_OUTDATED) return outdated();
    const g = useGame.getState();
    if (!g.pvp) {
      onError?.("Couldn't join — check the code; a match may already be running, or the lobby is full.");
      session = null;
      return;
    }
    // OUR connection dropped. Reconnect to the same seat.
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

export function lobbyConnect(code: string, name: string, onError?: (why: string) => void) {
  lobbyClose();
  closedByUs = false;
  retryDelay = 500;
  offlineSince = 0;
  session = { code: code.toUpperCase(), name, onError };
  open();
}

export function lobbyClose() {
  closedByUs = true;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  session = null;
  net.send = null;
  try {
    ws?.close();
  } catch {
    /* already closed */
  }
  ws = null;
}

/** Leave the room (mid-match that's a surrender) and go back to the solo run. */
export function lobbyLeave() {
  net.send?.({ t: "leave" });
  lobbyClose();
  useGame.getState().pvpQuit();
}

// Live scouting: while planning, our arrangement goes to the room (debounced).
let boardTimer: ReturnType<typeof setTimeout> | null = null;
let lastSent = "";
useGame.subscribe((s, prev) => {
  if (!s.pvp || s.pvp.snap.stage !== "match" || s.phase !== "prep" || s.pvp.myReady || s.units === prev.units) return;
  if (!pvpMe(s.pvp)?.alive) return;
  if (boardTimer) clearTimeout(boardTimer);
  boardTimer = setTimeout(() => {
    const { units, pvp } = useGame.getState();
    const board = wireBoard(units);
    const key = `${pvp?.snap.match}:${JSON.stringify(board)}`;
    if (key === lastSent) return;
    lastSent = key;
    net.send?.({ t: "board", board });
  }, 400);
});

// Shared pool: the rookie copies we hold (bench and board), whenever our units change.
let heldTimer: ReturnType<typeof setTimeout> | null = null;
let heldSent = "";
useGame.subscribe((s, prev) => {
  if (!s.pvp || s.pvp.snap.stage !== "match" || s.units === prev.units || !pvpMe(s.pvp)?.alive) return;
  if (heldTimer) clearTimeout(heldTimer);
  heldTimer = setTimeout(() => {
    const { units, pvp } = useGame.getState();
    const counts = heldCopies(units);
    const key = `${pvp?.snap.match}:${JSON.stringify(counts)}`;
    if (key === heldSent) return;
    heldSent = key;
    net.send?.({ t: "held", counts });
  }, 400);
});

// dev-only test hooks: join from the console, drop the socket, read what was sent
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __lobby: object }).__lobby = {
    connect: lobbyConnect,
    leave: lobbyLeave,
    socket: () => ws,
    sent: () => sentLog,
  };
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
