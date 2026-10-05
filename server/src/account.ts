import { DurableObject } from "cloudflare:workers";

export interface AccountRecord {
  /** the Google first name, as last seen */
  googleName: string;
  created: number;
  lastSeen: number;
  /** the synced game data (the client's localStorage entries), as JSON */
  data: string | null;
  /** when `data` last changed — devices send the version they synced from */
  updatedAt: number;
  /** the data's layout (the game's DATA_SCHEMA when it was saved; missing = 1) */
  schema?: number;
}

/** One tamer's account (one per Google account, named by a hash of its id): the game data
 *  every device of theirs syncs. */
export class Account extends DurableObject {
  async load(): Promise<AccountRecord | null> {
    return (await this.ctx.storage.get<AccountRecord>("rec")) ?? null;
  }

  /** a sign-in: creates the account the first time */
  async touch(googleName: string): Promise<AccountRecord> {
    const now = Date.now();
    const rec = (await this.load()) ?? { googleName, created: now, lastSeen: now, data: null, updatedAt: 0 };
    rec.googleName = googleName;
    rec.lastSeen = now;
    await this.ctx.storage.put("rec", rec);
    return rec;
  }

  /** Stores the data unless another device saved since `base` (then returns what's stored,
   *  for the caller to take) — `force` overwrites regardless. Never from an older game than
   *  the one that saved last (`outdated`): it would drop what it doesn't know about. */
  async save(
    data: string,
    base: number,
    force: boolean,
    schema = 1,
  ): Promise<{ ok: boolean; updatedAt: number; data: string | null; outdated?: boolean }> {
    const rec = await this.load();
    if (!rec) return { ok: false, updatedAt: 0, data: null };
    if (schema < (rec.schema ?? 1)) return { ok: false, updatedAt: rec.updatedAt, data: null, outdated: true };
    if (!force && rec.updatedAt > base) return { ok: false, updatedAt: rec.updatedAt, data: rec.data };
    rec.data = data;
    rec.schema = schema;
    rec.updatedAt = Math.max(Date.now(), rec.updatedAt + 1);
    rec.lastSeen = Date.now();
    await this.ctx.storage.put("rec", rec);
    return { ok: true, updatedAt: rec.updatedAt, data: null };
  }

  /** everything about the account, gone (the privacy page promises it) */
  async erase(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}
