/**
 * Build channel: "live" is the main site; "v3" is the test address for the next rules
 * (M10 — tiers by evolution stage), built with VITE_CHANNEL=v3 (`npm run deploy:v3`).
 * Test builds stay off the shared leaderboard and out of VS: the live worker runs the
 * live rules, and test runs mustn't land on the board everyone sees.
 */
export const CHANNEL: string = import.meta.env.VITE_CHANNEL || "live";
export const TEST_CHANNEL = CHANNEL !== "live";
