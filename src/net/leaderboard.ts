import type { PvpBoardUnit } from "../game/store";
import { TEST_CHANNEL } from "../channel";

/** Anonymous leaderboard client: device id + chosen name, no accounts. */

const BASE = "https://digimon-autochess-mp.askuznetsov6996.workers.dev";

export interface LbEntry {
  id: string;
  name: string;
  best: number;
  wins: number;
  /** VS lobby rating (moves with every final place) */
  rating: number;
  hasBoard: number;
}

export function playerId(): string {
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
  if (TEST_CHANNEL) return;
  try {
    void fetch(`${BASE}/lb/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: playerId(), name: playerName(), ...data }),
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
