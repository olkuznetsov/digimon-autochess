import { formOf, isPlayable } from "../../src/game/creatures";
import { ITEMS } from "../../src/game/items";
import { CLOSE_OUTDATED } from "../../src/game/lobby";

/** Turn away a client running other rules. The socket is accepted just to say so: a
 *  refused handshake reaches the browser without its status, as a bare "closed". It's
 *  accepted the hibernatable way, like every other socket of the room — no attachment,
 *  so the room's handlers ignore it (a plain `accept()` socket closed by the room shows
 *  up as an uncaught "Network connection lost" in the worker). */
export function outdatedSocket(ctx: DurableObjectState): Response {
  const [client, server] = Object.values(new WebSocketPair());
  ctx.acceptWebSocket(server);
  server.send(JSON.stringify({ t: "outdated" }));
  server.close(CLOSE_OUTDATED, "outdated");
  return new Response(null, { status: 101, webSocket: client });
}

/** Display names: printable, trimmed, collapsed whitespace, max 16. */
export function cleanName(raw: unknown): string {
  const n = String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 16);
  return n || "Tamer";
}

export interface BoardUnit {
  uid: string;
  formId: string;
  col: number;
  row: number;
  items: string[];
}

/** A board must be real player forms (no bosses, no wild Digimon) on real player cells
 *  (rows 0–2) with real items; null when anything is off. An empty board is valid. */
export function cleanUnits(raw: unknown): BoardUnit[] | null {
  if (!Array.isArray(raw) || raw.length > 9) return null;
  const units: BoardUnit[] = [];
  for (const u of raw as Record<string, unknown>[]) {
    const formId = String(u?.formId ?? "");
    const col = Number(u?.col);
    const row = Number(u?.row);
    const items = Array.isArray(u?.items) ? (u.items as unknown[]).map(String) : [];
    if (!isPlayable(formOf(formId))) return null;
    if (!Number.isInteger(col) || col < 0 || col > 5 || !Number.isInteger(row) || row < 0 || row > 2) return null;
    if (items.length > 2 || items.some((i) => !ITEMS[i])) return null;
    units.push({ uid: String(u?.uid ?? "").slice(0, 24), formId, col, row, items });
  }
  return units;
}

/** A leaderboard ghost board: a valid, non-empty board as JSON. */
export function cleanBoard(raw: unknown): string | null {
  const units = cleanUnits(raw);
  return units && units.length > 0 ? JSON.stringify(units) : null;
}
