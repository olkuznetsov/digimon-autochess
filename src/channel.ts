/**
 * Build channel: "live" is the main site; "v3" is the test address for the next rules
 * (M10 — tiers by evolution stage), built with VITE_CHANNEL=v3 (`npm run deploy:v3`).
 * A test build talks to its own worker (`npm run deploy:worker:v3`): its own rules
 * version, VS lobbies and leaderboard — test runs never land on the live ones.
 */
export const CHANNEL: string = import.meta.env.VITE_CHANNEL || "live";
export const TEST_CHANNEL = CHANNEL !== "live";
/** this channel's multiplayer + leaderboard worker */
export const WORKER_HOST = TEST_CHANNEL
  ? `digimon-autochess-mp-${CHANNEL}.askuznetsov6996.workers.dev`
  : "digimon-autochess-mp.askuznetsov6996.workers.dev";

/** The dev server can talk to a local worker instead (`wrangler dev` on, say, port 8799,
 *  and VITE_WORKER=localhost:8799 for Vite) — plain http and ws there. */
const LOCAL_WORKER = import.meta.env.DEV ? (import.meta.env.VITE_WORKER as string | undefined) : undefined;
export const WORKER_HTTP = LOCAL_WORKER ? `http://${LOCAL_WORKER}` : `https://${WORKER_HOST}`;
export const WORKER_WS = LOCAL_WORKER ? `ws://${LOCAL_WORKER}` : `wss://${WORKER_HOST}`;
