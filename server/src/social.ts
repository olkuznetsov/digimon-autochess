import { DurableObject } from "cloudflare:workers";
import { formOf } from "../../src/game/creatures";
import { cleanName } from "./util";

/**
 * Friends (one instance, "social"): every signed-in tamer's code, their friends, what
 * they're up to and invites to a VS room. Clients check in every half a minute while the
 * game is open (`beat`): that stores where they are and hands back their friends and any
 * invites, so presence needs no sockets. A friendship is mutual from the moment one tamer
 * enters the other's code — knowing it means it was shared.
 */

/** tamer codes: no 0/O, 1/I/L */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/** a tamer seen this recently is online */
export const ONLINE_MS = 75_000;
/** an invite stands this long */
const INVITE_MS = 10 * 60_000;
const MAX_FRIENDS = 50;

export interface FriendView {
  code: string;
  name: string;
  partner: string | null;
  /** what they're doing: "menu", "solo:12", "lobby:ABCD", "vs", "ghost" */
  status: string;
  seen: number;
  online: boolean;
}
export interface InviteView {
  id: number;
  from: { code: string; name: string; partner: string | null };
  room: string;
  at: number;
}

const cleanStatus = (s: unknown) => {
  const v = String(s ?? "");
  return /^(menu|vs|ghost|solo:\d{1,3}|lobby:[A-Z0-9]{4,8})$/.test(v) ? v : "menu";
};
const cleanPartner = (p: unknown) => {
  const id = String(p ?? "");
  return id && formOf(id) ? id : null;
};

export class Social extends DurableObject {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    ctx.blockConcurrencyWhile(async () => {
      const sql = this.ctx.storage.sql;
      sql.exec(`CREATE TABLE IF NOT EXISTS tamers (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        partner TEXT,
        status TEXT NOT NULL DEFAULT 'menu',
        seen INTEGER NOT NULL
      )`);
      sql.exec(`CREATE TABLE IF NOT EXISTS friends (
        a TEXT NOT NULL,
        b TEXT NOT NULL,
        since INTEGER NOT NULL,
        PRIMARY KEY (a, b)
      )`);
      sql.exec(`CREATE TABLE IF NOT EXISTS invites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        to_id TEXT NOT NULL,
        from_id TEXT NOT NULL,
        room TEXT NOT NULL,
        at INTEGER NOT NULL
      )`);
      sql.exec("CREATE INDEX IF NOT EXISTS invites_to ON invites (to_id)");
    });
  }

  private sql<T extends Record<string, SqlStorageValue>>(q: string, ...args: SqlStorageValue[]): T[] {
    return this.ctx.storage.sql.exec<T>(q, ...args).toArray();
  }

  private newCode(): string {
    for (;;) {
      let c = "";
      for (let i = 0; i < 6; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
      if (!this.sql("SELECT 1 FROM tamers WHERE code = ?", c).length) return c;
    }
  }

  private friendsOf(id: string): FriendView[] {
    const now = Date.now();
    return this.sql<{ code: string; name: string; partner: string | null; status: string; seen: number }>(
      `SELECT t.code, t.name, t.partner, t.status, t.seen FROM friends f JOIN tamers t ON t.id = f.b
       WHERE f.a = ? ORDER BY t.seen DESC`,
      id,
    ).map((r) => ({ ...r, online: now - r.seen < ONLINE_MS }));
  }

  private invitesFor(id: string): InviteView[] {
    this.sql("DELETE FROM invites WHERE at < ?", Date.now() - INVITE_MS);
    return this.sql<{ id: number; room: string; at: number; code: string; name: string; partner: string | null }>(
      `SELECT i.id, i.room, i.at, t.code, t.name, t.partner FROM invites i JOIN tamers t ON t.id = i.from_id
       WHERE i.to_id = ? ORDER BY i.at DESC LIMIT 5`,
      id,
    ).map((r) => ({ id: r.id, room: r.room, at: r.at, from: { code: r.code, name: r.name, partner: r.partner } }));
  }

  /** A check-in: where the tamer is now; back come their code, friends and invites. */
  async beat(id: string, e: { name?: unknown; partner?: unknown; status?: unknown }) {
    const name = cleanName(e.name);
    const partner = cleanPartner(e.partner);
    const status = cleanStatus(e.status);
    const now = Date.now();
    const row = this.sql<{ code: string }>("SELECT code FROM tamers WHERE id = ?", id)[0];
    const code = row?.code ?? this.newCode();
    if (row) this.sql("UPDATE tamers SET name = ?, partner = ?, status = ?, seen = ? WHERE id = ?", name, partner, status, now, id);
    else this.sql("INSERT INTO tamers (id, code, name, partner, status, seen) VALUES (?, ?, ?, ?, ?, ?)", id, code, name, partner, status, now);
    return { code, friends: this.friendsOf(id), invites: this.invitesFor(id) };
  }

  /** Befriend the tamer with this code (both ways). */
  async add(id: string, code: string): Promise<{ ok: boolean; error?: string; friends?: FriendView[] }> {
    const target = this.sql<{ id: string }>("SELECT id FROM tamers WHERE code = ?", String(code).toUpperCase().slice(0, 8))[0];
    if (!target) return { ok: false, error: "No tamer has that code" };
    if (target.id === id) return { ok: false, error: "That's your own code" };
    if (!this.sql("SELECT 1 FROM tamers WHERE id = ?", id).length) return { ok: false, error: "Check in first" };
    const count = this.sql<{ n: number }>("SELECT COUNT(*) AS n FROM friends WHERE a = ?", id)[0]?.n ?? 0;
    if (count >= MAX_FRIENDS) return { ok: false, error: `Up to ${MAX_FRIENDS} friends` };
    const now = Date.now();
    this.sql("INSERT OR IGNORE INTO friends (a, b, since) VALUES (?, ?, ?)", id, target.id, now);
    this.sql("INSERT OR IGNORE INTO friends (a, b, since) VALUES (?, ?, ?)", target.id, id, now);
    return { ok: true, friends: this.friendsOf(id) };
  }

  /** Part ways (both sides). */
  async remove(id: string, code: string): Promise<{ ok: boolean; friends: FriendView[] }> {
    const target = this.sql<{ id: string }>("SELECT id FROM tamers WHERE code = ?", String(code).toUpperCase().slice(0, 8))[0];
    if (target) {
      this.sql("DELETE FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)", id, target.id, target.id, id);
      this.sql("DELETE FROM invites WHERE (to_id = ? AND from_id = ?) OR (to_id = ? AND from_id = ?)", id, target.id, target.id, id);
    }
    return { ok: true, friends: this.friendsOf(id) };
  }

  /** Invite a friend to a VS room (one standing invite per friend). */
  async invite(id: string, code: string, room: string): Promise<{ ok: boolean; error?: string }> {
    const r = String(room).toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(r)) return { ok: false, error: "bad room" };
    const target = this.sql<{ id: string }>("SELECT id FROM tamers WHERE code = ?", String(code).toUpperCase().slice(0, 8))[0];
    if (!target || !this.sql("SELECT 1 FROM friends WHERE a = ? AND b = ?", id, target.id).length) return { ok: false, error: "Not a friend" };
    this.sql("DELETE FROM invites WHERE to_id = ? AND from_id = ?", target.id, id);
    this.sql("INSERT INTO invites (to_id, from_id, room, at) VALUES (?, ?, ?, ?)", target.id, id, r, Date.now());
    return { ok: true };
  }

  /** An invite answered or waved away. */
  async dismiss(id: string, inviteId: number): Promise<void> {
    this.sql("DELETE FROM invites WHERE id = ? AND to_id = ?", Math.floor(Number(inviteId) || 0), id);
  }

  /** The account is gone: so is everything here about it. */
  async forget(id: string): Promise<void> {
    this.sql("DELETE FROM friends WHERE a = ? OR b = ?", id, id);
    this.sql("DELETE FROM invites WHERE to_id = ? OR from_id = ?", id, id);
    this.sql("DELETE FROM tamers WHERE id = ?", id);
  }
}
