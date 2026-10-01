#!/usr/bin/env node
/**
 * Bundles a TypeScript script (default scripts/run-sim.ts) for Node and runs it:
 * `node scripts/run-ts.mjs scripts/lobby-check.ts [args]`. The game store imports
 * the network (leaderboard, PvP bus) and audio modules; they are replaced with
 * no-op stubs here so bot runs never touch the live leaderboard and need no Web Audio.
 */
import { build } from "esbuild";
import { pathToFileURL } from "node:url";

const STUB = `
export const net = {};
export function submitScore() {}
export const sfx = new Proxy({}, { get: () => () => {} });
export function battleSfx() {}
`;

const entry = process.argv[2]?.endsWith(".ts") ? process.argv.splice(2, 1)[0] : "scripts/run-sim.ts";
const out = `node_modules/.cache/${entry.replace(/^.*\//, "").replace(/\.ts$/, "")}.mjs`;
await build({
  entryPoints: [entry],
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
        b.onResolve({ filter: /\/(net\/(bus|leaderboard|lobby)|audio\/sfx)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: STUB, loader: "js" }));
      },
    },
  ],
});
await import(pathToFileURL(out).href);
