#!/usr/bin/env node
/**
 * Sanity checks for the shipped models (public/models/*.glb) — run after
 * `npm run optimize-models` or whenever a model is added:
 *  - every model has the clips the renderer relies on (idle, attack01, move),
 *  - every clip carries the same baked scale as idle on the non-joint nodes that size
 *    the whole model (GRP_joint, GRP_mesh, chrNNN…) — FBX rips bake unit scale into
 *    animation tracks, and a clip without them resizes the model mid-animation.
 *    Scale on skeleton joints is choreography (weapons popping in, a shell opening)
 *    and is not checked,
 *  - the manifest has a hash for every model.
 * Exits non-zero on problems.
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { readdirSync, readFileSync } from "node:fs";

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const manifest = readFileSync("src/three/model-manifest.ts", "utf8");

const firstScale = (anim) => {
  const m = new Map();
  for (const ch of anim.listChannels()) {
    if (ch.getTargetPath() !== "scale") continue;
    m.set(ch.getTargetNode(), ch.getSampler().getOutput().getElement(0, []));
  }
  return m;
};
const same = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-3);

const problems = [];
const files = readdirSync("public/models").filter((f) => f.endsWith(".glb")).sort();
for (const f of files) {
  const id = f.slice(0, -4);
  const doc = await io.read(`public/models/${f}`);
  const anims = doc.getRoot().listAnimations();
  const names = anims.map((a) => a.getName());
  for (const need of ["idle", "attack01", "move"]) if (!names.includes(need)) problems.push(`${id}: missing clip "${need}"`);
  const idle = anims.find((a) => a.getName() === "idle");
  const joints = new Set(doc.getRoot().listSkins().flatMap((sk) => sk.listJoints()));
  if (idle) {
    const ref = new Map([...firstScale(idle)].filter(([node]) => !joints.has(node)));
    for (const a of anims) {
      if (a === idle) continue;
      const sc = firstScale(a);
      for (const [node, v] of ref) {
        const got = sc.get(node);
        if (!got) problems.push(`${id} ${a.getName()}: no scale track for ${node.getName()} (idle ${v[0].toFixed(3)})`);
        else if (!same(got, v)) problems.push(`${id} ${a.getName()}: ${node.getName()} scale ${got[0].toFixed(3)} ≠ idle ${v[0].toFixed(3)}`);
      }
    }
  }
  if (!new RegExp(`^\\s+${id}: "\\w+",$`, "m").test(manifest)) problems.push(`${id}: no hash in model-manifest.ts`);
}
if (problems.length) {
  console.log(problems.join("\n"));
  console.log(`\n✗ ${problems.length} problem(s) in ${files.length} models`);
  process.exit(1);
}
console.log(`✓ ${files.length} models OK (clips present, baked scale consistent, manifest complete)`);
