/** Public matchmaking: wait in the queue (the Matchmaker Durable Object) until a
 *  public lobby forms, then join it like any other room. */
import { CLOSE_OUTDATED } from "../game/lobby";
import { RULES_VERSION } from "../game/rules-version";
import { OUTDATED_MESSAGE } from "./lobby";
import { WORKER_HOST } from "../channel";

const QUEUE_URL = `wss://${WORKER_HOST}/queue`;

export interface QueueStatus {
  /** tamers searching right now, us included */
  waiting: number;
  /** when the longest-waiting one joined, and how long the queue gathers before it starts what it has */
  oldestAt: number;
  gatherMs: number;
}

/** the queue socket, and whether we left it on purpose (no error then) */
let current: { socket: WebSocket; left: boolean } | null = null;

export function queueJoin(
  name: string,
  on: { status: (s: QueueStatus) => void; match: (code: string) => void; error: (why: string) => void },
) {
  queueLeave();
  const socket = new WebSocket(`${QUEUE_URL}?name=${encodeURIComponent(name)}&v=${RULES_VERSION}`);
  const me = { socket, left: false };
  current = me;
  let matched = false;
  socket.onmessage = (e) => {
    let m: { t: string } & Record<string, unknown>;
    try {
      m = JSON.parse(String(e.data));
    } catch {
      return;
    }
    if (m.t === "outdated") {
      // the queue runs other rules than this tab: say so now (the close lags behind)
      me.left = true;
      socket.close();
      on.error(OUTDATED_MESSAGE);
    } else if (m.t === "queue") on.status({ waiting: Number(m.waiting), oldestAt: Number(m.oldestAt), gatherMs: Number(m.gatherMs) });
    else if (m.t === "match" && typeof m.code === "string") {
      matched = true;
      on.match(m.code);
    }
  };
  socket.onclose = (e) => {
    if (current === me) current = null;
    if (matched || me.left) return;
    on.error(e.code === CLOSE_OUTDATED ? OUTDATED_MESSAGE : "Lost the matchmaking queue — try again.");
  };
}

export function queueLeave() {
  if (!current) return;
  current.left = true;
  try {
    current.socket.close();
  } catch {
    /* already closed */
  }
  current = null;
}
