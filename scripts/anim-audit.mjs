#!/usr/bin/env node
/**
 * Animation audit of the shipped models (public/models): for every battle clip, how far a
 * part reaches out of the model's idle silhouette (joint distance from the idle centre, in
 * idle heights) and how far the whole body drifts from its spot (the root joints' horizontal
 * travel). Parts that fly far out or bodies that wander are what looks wrong on a 1-cell
 * board square; the worst are printed first.
 *
 * Usage: node scripts/anim-audit.mjs [<formId> ...] [--top=40]
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { isBodyJoint, posesOf as posesOf_ } from "./lib/clip-math.mjs";

const DIR = "public/models";
const CLIPS = ["idle", "move", "attack01", "special01", "damage", "down", "win"];
const FPS = 20;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const args = process.argv.slice(2);
const top = Number(args.find((a) => a.startsWith("--top="))?.slice(6) ?? 40);
const only = args.filter((a) => !a.startsWith("--"));
const files = readdirSync(DIR).filter((f) => f.endsWith(".glb") && (only.length === 0 || only.includes(basename(f, ".glb"))));

const median = (v) => [...v].sort((x, y) => x - y)[v.length >> 1];
const rows = [];
const broken = [];
for (const file of files.sort()) {
  const id = basename(file, ".glb");
  const doc = await io.read(join(DIR, file));
  const root = doc.getRoot();
  const joints = root.listSkins()[0]?.listJoints() ?? [];
  if (!joints.length) continue;
  const body = joints.filter(isBodyJoint);
  const posesOf = (clip) => posesOf_(clip, body, FPS);
  const anims = root.listAnimations();
  const idle = anims.find((a) => a.getName() === "idle");
  if (!idle) continue;
  const p0 = posesOf(idle)[0];
  const lo = [0, 1, 2].map((k) => Math.min(...p0.map((p) => p[k])));
  const hi = [0, 1, 2].map((k) => Math.max(...p0.map((p) => p[k])));
  const h = Math.max(1e-6, hi[1] - lo[1]);
  const c = [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2);
  const r0 = Math.max(...p0.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]))) / h;
  const s0 = [median(p0.map((p) => p[0])), median(p0.map((p) => p[2]))];
  for (const name of CLIPS) {
    const clip = anims.find((a) => a.getName() === name);
    if (!clip) continue;
    const poses = posesOf(clip);
    let reach = 0, drift = 0;
    for (const ps of poses) {
      for (const p of ps) reach = Math.max(reach, Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) / h);
      // the body's own spot: the median of its joints, horizontally (a hidden joint flung far
      // can't move it)
      drift = Math.max(drift, Math.hypot(median(ps.map((p) => p[0])) - s0[0], median(ps.map((p) => p[2])) - s0[1]) / h);
    }
    // a NaN would scramble the sort: such a clip has broken keys — list it on its own
    if (!Number.isFinite(reach / r0) || !Number.isFinite(drift)) broken.push(`${id} ${name}`);
    else rows.push({ id, clip: name, reach: reach / r0, drift });
  }
}
const show = (title, key) => {
  console.log(`\n== ${title}`);
  for (const r of [...rows].sort((a, b) => b[key] - a[key]).slice(0, top)) console.log(`  ${r.id.padEnd(18)} ${r.clip.padEnd(9)} reach ×${r.reach.toFixed(2)}  drift ${r.drift.toFixed(2)} h`);
};
show("parts reaching furthest out of the idle silhouette (× its radius)", "reach");
show("bodies drifting furthest from their spot (in idle heights)", "drift");
if (broken.length) console.log(`\n== clips with broken keys (NaN poses): ${broken.join(", ")}`);
