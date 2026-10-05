import type { PvpBoardUnit } from "../game/store";
import { WORKER_HTTP } from "../channel";
import { session } from "./account";

/** Leaderboard client: the chosen name, keyed by the device — or by the account, once signed in. */

const BASE = WORKER_HTTP;

export interface LbEntry {
  id: string;
  name: string;
  best: number;
  wins: number;
  /** VS lobby rating (moves with every final place) */
  rating: number;
  hasBoard: number;
  /** their partner, shown as their avatar */
  partner?: string | null;
}

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
    return "anon";
  }
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

export async function fetchBoard(id: string): Promise<PvpBoardUnit[]> {
  const r = await fetch(`${BASE}/lb/board/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error("no board saved");
  return r.json();
}
