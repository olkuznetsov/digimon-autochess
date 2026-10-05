#!/usr/bin/env node
/**
 * Animation audit of the shipped models (public/models): for every battle clip, how far a
 * part reaches out of the model's idle silhouette (joint distance from the idle centre, in
 * idle heights), how far the whole body drifts from its spot (the root joints' horizontal
 * travel) and how far the skin stretches (two joints that share vertices, apart by how many
 * times their idle distance — Machinedramon's hand shooting out on a forearm pulled into a
 * spike). Parts that fly far out, bodies that wander and stretched faces are what looks wrong
 * on a 1-cell board square; the worst are printed first.
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
const CLIPS = ["idle", "move", "attack01", "attack02", "special01", "special02", "damage", "down", "guard", "win"];
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
  // joints that share vertices (a vertex weighted ≥ 0.15 to both): the skin between them stretches
  const index = new Map(body.map((j, k) => [j, k]));
  const pairs = new Set();
  for (const mesh of root.listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const ja = prim.getAttribute("JOINTS_0");
      const wa = prim.getAttribute("WEIGHTS_0");
      if (!ja || !wa) continue;
      const skinJoints = root.listSkins()[0].listJoints();
      const jv = [];
      const wv = [];
      for (let v = 0; v < ja.getCount(); v++) {
        ja.getElement(v, jv);
        wa.getElement(v, wv);
        const total = wv.reduce((x, y) => x + y, 0) || 1;
        const strong = jv.filter((_, k) => wv[k] / total >= 0.15).map((ji) => index.get(skinJoints[ji])).filter((k) => k !== undefined);
        for (let a = 0; a < strong.length; a++) for (let b = a + 1; b < strong.length; b++) if (strong[a] !== strong[b]) pairs.add(strong[a] < strong[b] ? `${strong[a]},${strong[b]}` : `${strong[b]},${strong[a]}`);
      }
    }
  const pairList = [...pairs].map((k) => k.split(",").map(Number));
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
  const dist = (ps, [a, b]) => Math.hypot(ps[a][0] - ps[b][0], ps[a][1] - ps[b][1], ps[a][2] - ps[b][2]);
  const rest = pairList.map((pr) => dist(p0, pr));
  for (const name of CLIPS) {
    const clip = anims.find((a) => a.getName() === name);
    if (!clip) continue;
    const poses = posesOf(clip);
    let reach = 0, drift = 0, stretch = 1, stretched = "";
    for (const ps of poses) {
      pairList.forEach((pr, k) => {
        // a pair close together at rest stretches by its own measure, not by a near-zero one
        const r = Math.max(rest[k], h * 0.05);
        const x = dist(ps, pr) / r;
        if (x > stretch) {
          stretch = x;
          stretched = `${body[pr[0]].getName()}–${body[pr[1]].getName()}`;
        }
      });
      for (const p of ps) reach = Math.max(reach, Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) / h);
      // the body's own spot: the median of its joints, horizontally (a hidden joint flung far
      // can't move it)
      drift = Math.max(drift, Math.hypot(median(ps.map((p) => p[0])) - s0[0], median(ps.map((p) => p[2])) - s0[1]) / h);
    }
    // a NaN would scramble the sort: such a clip has broken keys — list it on its own
    if (!Number.isFinite(reach / r0) || !Number.isFinite(drift)) broken.push(`${id} ${name}`);
    else rows.push({ id, clip: name, reach: reach / r0, drift, stretch, stretched });
  }
}
const show = (title, key) => {
  console.log(`\n== ${title}`);
  for (const r of [...rows].sort((a, b) => b[key] - a[key]).slice(0, top))
    console.log(`  ${r.id.padEnd(18)} ${r.clip.padEnd(9)} reach ×${r.reach.toFixed(2)}  drift ${r.drift.toFixed(2)} h  stretch ×${r.stretch.toFixed(1)} ${r.stretched}`);
};
show("parts reaching furthest out of the idle silhouette (× its radius)", "reach");
show("bodies drifting furthest from their spot (in idle heights)", "drift");
show("skin stretched furthest (two joints sharing vertices, × their idle distance)", "stretch");
if (broken.length) console.log(`\n== clips with broken keys (NaN poses): ${broken.join(", ")}`);
