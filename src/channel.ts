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
