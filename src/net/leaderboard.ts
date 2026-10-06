import type { PvpBoardUnit } from "../game/store";
import { WORKER_HTTP } from "../channel";
import { session } from "./account";

/** Leaderboard client: the chosen name, keyed by the device — or by the account, once signed in. */

const BASE = WORKER_HTTP;

export interface LbEntry {
  /** the tamer's public handle (a hash of their id: the id itself never leaves the worker) */
  key: string;
  name: string;
  best: number;
  wins: number;
  /** VS lobby rating (moves with every final place) */
  rating: number;
  hasBoard: number;
  /** their partner, shown as their avatar */
  partner?: string | null;
}

/** For a browser that keeps no storage: an id for this visit only. */
let visitId: string | null = null;

export function playerId(): string {
  const account = session();
  if (account) return account.id;
  try {
    let id = localStorage.getItem("dac-pid");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("dac-pid", id);
    }
    return id;
  } catch {
    // never one shared id: every storage-less tamer would overwrite the others' scores
    return (visitId ??= crypto.randomUUID());
  }
}

/** This tamer's public handle, as the worker shows it in its tables (see publicKey there). */
let keyMemo: { id: string; key: Promise<string> } | null = null;
export function myPublicKey(): Promise<string> {
  const id = playerId();
  if (keyMemo?.id !== id) {
    keyMemo = {
      id,
      key: crypto.subtle
        .digest("SHA-256", new TextEncoder().encode(`pub:${id}`))
        .then((h) => [...new Uint8Array(h).slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("")),
    };
  }
  return keyMemo.key;
}

/** The partner at the tamer's side (their avatar), straight from the saved profile. */
export function partnerForm(): string | null {
  try {
    return (JSON.parse(localStorage.getItem("dac-profile-v1") ?? "null")?.partner?.formId as string | undefined) ?? null;
  } catch {
    return null;
  }
}

export function playerName(): string {
  try {
    return localStorage.getItem("dac-name") || "Tamer";
  } catch {
    return "Tamer";
  }
}

/** Fire-and-forget score/board submission (never blocks gameplay). */
export function submitScore(data: { best?: number; winsDelta?: 1; board?: PvpBoardUnit[] }) {
  // the dev server shares the production leaderboard — keep test runs off it
  // (set localStorage "dac-dev-submit" to test submissions deliberately)
  if (import.meta.env.DEV && !localStorage.getItem("dac-dev-submit")) return;
  try {
    void fetch(`${BASE}/lb/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: playerId(), name: playerName(), partner: partnerForm(), ...data }),
    }).catch(() => {});
  } catch {
    /* offline — ignore */
  }
}

export async function fetchTop(by: "best" | "rating" = "best"): Promise<LbEntry[]> {
  const r = await fetch(`${BASE}/lb/top${by === "rating" ? "?by=rating" : ""}`);
  if (!r.ok) throw new Error("leaderboard unavailable");
  return r.json();
}

export async function fetchBoard(key: string): Promise<PvpBoardUnit[]> {
  const r = await fetch(`${BASE}/lb/board/${encodeURIComponent(key)}`);
  if (!r.ok) throw new Error("no board saved");
  return r.json();
}
