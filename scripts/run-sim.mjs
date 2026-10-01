#!/usr/bin/env node
/**
 * Bundles scripts/run-sim.ts for Node and runs it. The game store imports the
 * network (leaderboard, PvP bus) and audio modules; they are replaced with no-op
 * stubs here so bot runs never touch the live leaderboard and need no Web Audio.
 */
import { build } from "esbuild";
import { pathToFileURL } from "node:url";

const STUB = `
export const net = {};
export function submitScore() {}
export const sfx = new Proxy({}, { get: () => () => {} });
export function battleSfx() {}
`;

const out = "node_modules/.cache/run-sim.mjs";
await build({
  entryPoints: ["scripts/run-sim.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: out,
  logLevel: "warning",
  define: { "import.meta.env.DEV": "false" },
  plugins: [
    {
      name: "stub-side-effects",
      setup(b) {
        b.onResolve({ filter: /\/(net\/(bus|leaderboard|pvp)|audio\/sfx)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: STUB, loader: "js" }));
      },
    },
  ],
});
process.argv.splice(2, 0); // pass-through args (runs=, seed=, maxRound=)
await import(pathToFileURL(out).href);
