#!/usr/bin/env node
/**
 * Builds the shipped creature models from the originals.
 *
 *   models-src/<formId>.glb (+ external .png textures)   — source of truth, never edited
 *     → public/models/<formId>.glb                         — what the game downloads
 *     → src/three/model-manifest.ts                        — per-model content hashes (cache busting)
 *
 * Steps per model:
 *  1. drop animation clips the game never plays (Cyber Sleuth rips carry eat/getup/glad/…,
 *     Gankoomon alone has 33 clips),
 *  2. resample — remove keyframes that linear interpolation already reproduces (the rips
 *     are baked at 30 fps per bone),
 *  3. dedup + prune leftovers,
 *  4. textures → WebP (max 1024px) embedded in the .glb (one request per model),
 *  5. EXT_meshopt_compression (decoded by three-stdlib's bundled MeshoptDecoder — no CDN).
 *
 *  6. scale harmonization: FBX-origin rigs bake unit scale into ANIMATION tracks, and some
 *     clips lack those tracks (e.g. Angemon attack01, Ikkakumon special01 — GRP_mesh is 1.0
 *     statically but 0.394 in idle), so playing them lets parts of the model drift to another
 *     size. Every kept clip gets idle's constant scale tracks where it has none.
 *  7. materials: drop KHR_materials_specular / KHR_materials_volume — assimp artifacts (black
 *     specular on 40 of 60 materials = no highlights at all; volume without transmission is
 *     inert) that also force the heavier MeshPhysicalMaterial — and cap roughness at 0.7 so
 *     the models catch the scene's environment light.
 *  8. scale chains: Cyber Sleuth's animators scaled a chain's joints each on its own — all five
 *     of Palmon's vine segments at 1.75 (each 75% longer), the Eater's tentacle swelling segment
 *     by segment — the way Maya shows it with segment scale compensation: a child joint with a
 *     scale of its own doesn't take on its parent's. glTF always passes scale on, so the scales
 *     compounded down the chain: Palmon's vine tip stretched 1.75^5 = 16× and reached five Palmons away, the
 *     tentacles ballooned. Such a child's keys become S_parent⁻¹·R·S (its offset still follows
 *     the parent's scale, exactly as compensation does). A child with no scale of its own keeps
 *     inheriting — a body that grows takes its limbs along — and so does every child of a
 *     parent that squashes flat in the clip (Syakomon sinking into its shell) or is scaled to
 *     ~0 to hide what's below it (Taomon's brush and its straps).
 *  9. degenerate rotation keys: a few clips carry (0,0,0,0) quaternions (Lobomon's sword in
 *     its attacks, Darkdramon's wings going down, ToyAgumon's win) — three.js interpolates them
 *     into unnormalized rotations and the part warps for a few frames. Each takes its nearest
 *     valid key in the track (or the rest rotation).
 * 10. root motion: some clips carry the body across Cyber Sleuth's wide battlefield — Icemon's
 *     win walks off 22 heights, Crescemon's special flies 12 out and up — so on a board square
 *     the model left its cell. Where the body (its joints' median) strays more than ROOT_REACH
 *     heights from its idle spot, the travel of the joints that carry it (moving joints that
 *     carry at least half the body — J_center in most rigs, Aquilamon's "mass", Reppamon's
 *     "spine" — the one moving most first, up to three) is scaled down until it stays near:
 *     the same moves, a shorter way.
 *
 * Geometry, textures and animation stay visually lossless (meshopt "medium" quantizes
 * vertices; gltf-transform re-derives the skins' inverse bind matrices for that — verified
 * on all 46 models).
 *
 * Usage: npm run optimize-models [-- <formId> ...]
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, resample, textureCompress } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { isBodyJoint, posesOf } from "./lib/clip-math.mjs";

const SRC = "models-src";
const OUT = "public/models";
const MANIFEST = "src/three/model-manifest.ts";
/** how far a clip may carry the body from its spot, in idle heights (step 10) */
const ROOT_REACH = 1.2;
const KEEP_CLIPS = new Set([
  "idle", "move", "attack01", "attack02", "special01", "special02", "win", "damage", "down", "guard",
]);

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
const files = readdirSync(SRC)
  .filter((f) => f.endsWith(".glb"))
  .filter((f) => only.length === 0 || only.includes(basename(f, ".glb")))
  .sort();

const hashes = {};
let before = 0;
let after = 0;
for (const file of files) {
  const id = basename(file, ".glb");
  const src = join(SRC, file);
  const doc = await io.read(src); // resolves the external .png textures next to the source

  const clips = doc.getRoot().listAnimations();
  let dropped = 0;
  for (const anim of clips) {
    if (!KEEP_CLIPS.has(anim.getName())) {
      // dispose samplers/channels too — a disposed Animation leaves them alive, they keep
      // their keyframe accessors referenced, prune() skips them and the writer ships them
      // as dead weight (5 MB of orphaned keys in Gankoomon)
      for (const c of anim.listChannels()) c.dispose();
      for (const smp of anim.listSamplers()) smp.dispose();
      anim.dispose();
      dropped++;
    }
  }

  const fixed = harmonizeScale(doc);
  const chains = compensateChains(doc);
  const zeroRot = fixZeroRotations(doc);
  const rooted = tameRootMotion(doc);
  normalizeMaterials(doc);

  await doc.transform(
    dedup(),
    prune(),
    resample({ tolerance: 1e-4 }),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: "webp", quality: 88, resize: [1024, 1024] }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
    prune(),
  );

  const bytes = await io.writeBinary(doc);
  writeFileSync(join(OUT, file), bytes);
  hashes[id] = createHash("sha1").update(bytes).digest("hex").slice(0, 10);

  before += statSync(src).size;
  after += bytes.byteLength;
  console.log(
    `${id.padEnd(16)} ${(statSync(src).size / 1e6).toFixed(2).padStart(6)} MB → ${(bytes.byteLength / 1e6)
      .toFixed(2)
      .padStart(5)} MB   clips kept ${clips.length - dropped}/${clips.length}` +
      (fixed.length ? `   scale added: ${fixed.join(", ")}` : "") +
      (chains.length ? `   chains: ${chains.join(", ")}` : "") +
      (zeroRot.length ? `   zero rotations fixed: ${zeroRot.join(", ")}` : "") +
      (rooted.length ? `   root motion: ${rooted.join(", ")}` : ""),
  );
}

/** Plain metal/rough materials that react to the environment light (see step 7). */
function normalizeMaterials(doc) {
  for (const m of doc.getRoot().listMaterials()) m.setRoughnessFactor(Math.min(m.getRoughnessFactor(), 0.7));
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (ext.extensionName === "KHR_materials_specular" || ext.extensionName === "KHR_materials_volume") ext.dispose();
  }
}

/** Give every clip idle's constant scale tracks where it has none (see step 6). */
function harmonizeScale(doc) {
  const anims = doc.getRoot().listAnimations();
  const idle = anims.find((a) => a.getName() === "idle");
  if (!idle) return [];
  const buffer = doc.getRoot().listBuffers()[0];
  // only the non-joint nodes that size the whole model; joint scale is choreography
  // and a clip without it should show the bind value, as in the original game
  const joints = new Set(doc.getRoot().listSkins().flatMap((sk) => sk.listJoints()));
  const constScale = new Map();
  for (const ch of idle.listChannels()) {
    if (ch.getTargetPath() !== "scale" || joints.has(ch.getTargetNode())) continue;
    const out = ch.getSampler().getOutput();
    const first = out.getElement(0, []);
    let constant = true;
    for (let i = 1; i < out.getCount() && constant; i++) {
      const e = out.getElement(i, []);
      constant = e.every((v, k) => Math.abs(v - first[k]) < 1e-4);
    }
    if (constant) constScale.set(ch.getTargetNode(), first);
  }
  const added = [];
  for (const anim of anims) {
    if (anim === idle) continue;
    const has = new Set(anim.listChannels().filter((c) => c.getTargetPath() === "scale").map((c) => c.getTargetNode()));
    const end = Math.max(...anim.listSamplers().map((s) => s.getInput().getMax([])[0] ?? 0));
    for (const [node, v] of constScale) {
      if (has.has(node)) continue;
      const input = doc.createAccessor().setType("SCALAR").setArray(new Float32Array([0, end])).setBuffer(buffer);
      const output = doc.createAccessor().setType("VEC3").setArray(new Float32Array([...v, ...v])).setBuffer(buffer);
      const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation("LINEAR");
      anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath("scale").setSampler(sampler));
      added.push(`${anim.getName()}:${node.getName()}`);
    }
  }
  return added;
}

/** Scale chains (step 8): a child joint with a scale of its own doesn't take on its parent
 *  joint's — its rotation and scale keys become those of S_parent⁻¹·R·S. */
function compensateChains(doc) {
  const buffer = doc.getRoot().listBuffers()[0];
  const done = [];
  for (const anim of doc.getRoot().listAnimations()) {
    const tracks = new Map();
    for (const ch of anim.listChannels()) {
      const node = ch.getTargetNode();
      if (!node) continue;
      const t = tracks.get(node) ?? {};
      t[ch.getTargetPath()] = ch;
      tracks.set(node, t);
    }
    let n = 0;
    for (const [child, t] of tracks) {
      if (!t.scale || !child.getName().startsWith("J_") || !ownScale(t.scale.getSampler())) continue;
      const parent = child.getParentNode();
      const pt = parent?.getName().startsWith("J_") ? tracks.get(parent) : null;
      if (!pt?.scale || !ownScale(pt.scale.getSampler())) continue;
      const ps = pt.scale.getSampler();
      // a parent that squashes flat in this clip folds its children in with it (Syakomon's
      // body sinking into its shell): they keep inheriting throughout
      if (squashes(ps)) continue;
      const cs = t.scale.getSampler();
      const cr = t.rotation?.getSampler();
      // every key of the three tracks, and 30 fps between them
      const keys = [ps, cs, cr].filter(Boolean).flatMap((smp) => Array.from(smp.getInput().getArray()));
      const end = Math.max(...keys);
      const times = [...new Set([...keys, ...Array.from({ length: Math.floor(end * 30) + 1 }, (_, i) => i / 30)].map((x) => Math.round(x * 1e5) / 1e5))].sort((a, b) => a - b);
      const rot = new Float32Array(times.length * 4);
      const scl = new Float32Array(times.length * 3);
      let prev = null;
      times.forEach((time, i) => {
        const sp = sampleAt(ps, time);
        const sc = sampleAt(cs, time);
        let q = cr ? sampleAt(cr, time) : child.getRotation();
        let s3 = sc;
        // a parent scaled away hides its children with it
        if (Math.min(...sp.map(Math.abs)) >= 0.05) {
          const R = quatToMat(q);
          // columns of S_parent⁻¹ · R · S_child: their lengths are the scale, their directions the rotation
          const cols = [0, 1, 2].map((c) => [0, 1, 2].map((r) => (R[r][c] * sc[c]) / sp[r]));
          s3 = cols.map((v) => Math.hypot(...v));
          q = matToQuat(orthonormal(cols.map((v, c) => v.map((x) => x / (s3[c] || 1)))));
        }
        if (prev && q[0] * prev[0] + q[1] * prev[1] + q[2] * prev[2] + q[3] * prev[3] < 0) q = q.map((x) => -x);
        prev = q;
        rot.set(q, i * 4);
        scl.set(s3, i * 3);
      });
      const input = doc.createAccessor().setType("SCALAR").setArray(new Float32Array(times)).setBuffer(buffer);
      const rs = doc.createAnimationSampler().setInput(input).setInterpolation("LINEAR")
        .setOutput(doc.createAccessor().setType("VEC4").setArray(rot).setBuffer(buffer));
      const ss = doc.createAnimationSampler().setInput(input).setInterpolation("LINEAR")
        .setOutput(doc.createAccessor().setType("VEC3").setArray(scl).setBuffer(buffer));
      anim.addSampler(rs).addSampler(ss);
      if (t.rotation) t.rotation.setSampler(rs);
      else anim.addChannel(doc.createAnimationChannel().setTargetNode(child).setTargetPath("rotation").setSampler(rs));
      t.scale.setSampler(ss);
      n++;
    }
    if (n) done.push(`${anim.getName()}(${n})`);
  }
  return done;
}

/** Root motion (step 10): the carrying joint's travel scaled down where a clip takes the body off its spot. */
function tameRootMotion(doc) {
  const root = doc.getRoot();
  const buffer = root.listBuffers()[0];
  const joints = root.listSkins()[0]?.listJoints() ?? [];
  const body = joints.filter(isBodyJoint);
  const anims = root.listAnimations();
  const idle = anims.find((a) => a.getName() === "idle");
  if (!body.length || !idle) return [];
  // the body's spot: the median of its joints (a hidden joint flung far can't move it)
  const median = (v) => [...v].sort((a, b) => a - b)[v.length >> 1];
  const spotOf = (ps) => [median(ps.map((p) => p[0])), median(ps.map((p) => p[2]))];
  const p0 = posesOf(idle, body, 10)[0];
  const ys = p0.map((p) => p[1]);
  const h = Math.max(1e-6, Math.max(...ys) - Math.min(...ys));
  const spot = spotOf(p0);
  // how much of the body each joint carries
  const bodySet = new Set(body);
  const carries = new Map();
  const count = (node) => {
    if (carries.has(node)) return carries.get(node);
    const n = (bodySet.has(node) ? 1 : 0) + node.listChildren().reduce((sum, c) => sum + count(c), 0);
    carries.set(node, n);
    return n;
  };
  const driftOf = (anim) => {
    let d = 0;
    for (const ps of posesOf(anim, body, 15)) {
      const [x, z] = spotOf(ps);
      d = Math.max(d, Math.hypot(x - spot[0], z - spot[1]) / h);
    }
    return d;
  };
  const travel = (c) => {
    const a = c.getSampler().getOutput().getArray();
    let r = 0;
    for (const k of [0, 2]) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = k; i < a.length; i += 3) {
        lo = Math.min(lo, a[i]);
        hi = Math.max(hi, a[i]);
      }
      r = Math.max(r, hi - lo);
    }
    return r;
  };
  const done = [];
  for (const anim of anims) {
    if (anim === idle) continue;
    let drift = driftOf(anim);
    if (drift <= ROOT_REACH) continue;
    const before = drift;
    const used = new Set();
    const scaled = [];
    for (let pass = 0; pass < 3 && drift > ROOT_REACH * 1.05; pass++) {
      const ch = anim
        .listChannels()
        .filter((c) => c.getTargetPath() === "translation" && !used.has(c) && count(c.getTargetNode()) >= body.length / 2 && travel(c) > 1e-4)
        .sort((a, b) => travel(b) - travel(a))[0];
      if (!ch) break;
      used.add(ch);
      const f = ROOT_REACH / drift;
      const rest = ch.getTargetNode().getTranslation();
      const smp = ch.getSampler();
      const a = Float32Array.from(smp.getOutput().getArray());
      for (let i = 0; i < a.length; i += 3) for (let k = 0; k < 3; k++) a[i + k] = rest[k] + (a[i + k] - rest[k]) * f;
      const out = doc.createAccessor().setType("VEC3").setArray(a).setBuffer(buffer);
      const moved = doc.createAnimationSampler().setInput(smp.getInput()).setOutput(out).setInterpolation(smp.getInterpolation());
      anim.addSampler(moved);
      ch.setSampler(moved);
      scaled.push(`${ch.getTargetNode().getName()} ×${f.toFixed(2)}`);
      drift = driftOf(anim);
    }
    done.push(`${anim.getName()} ${before.toFixed(1)}h→${drift.toFixed(1)}h${scaled.length ? ` (${scaled.join(", ")})` : " (no joint carries it)"}`);
  }
  return done;
}

/** Degenerate rotation keys (step 9): each takes its nearest valid key, or the rest rotation. */
function fixZeroRotations(doc) {
  const fixed = [];
  for (const anim of doc.getRoot().listAnimations()) {
    for (const ch of anim.listChannels()) {
      if (ch.getTargetPath() !== "rotation") continue;
      const out = ch.getSampler().getOutput();
      const n = out.getCount();
      const keys = Array.from({ length: n }, (_, i) => out.getElement(i, []));
      const ok = keys.map((q) => Math.hypot(...q) > 0.5);
      if (ok.every(Boolean)) continue;
      for (let i = 0; i < n; i++) {
        if (ok[i]) continue;
        let j = -1;
        for (let d = 1; d < n && j < 0; d++) j = i - d >= 0 && ok[i - d] ? i - d : i + d < n && ok[i + d] ? i + d : -1;
        out.setElement(i, j >= 0 ? keys[j] : ch.getTargetNode().getRotation());
      }
      fixed.push(`${anim.getName()}:${ch.getTargetNode().getName()}`);
    }
  }
  return fixed;
}

/** A scale track that leaves 1 somewhere (ignoring keys where it hides the joint). */
function ownScale(sampler) {
  const a = sampler.getOutput().getArray();
  for (let i = 0; i < a.length; i += 3) {
    const k = [a[i], a[i + 1], a[i + 2]];
    if (Math.max(...k.map(Math.abs)) < 1e-3) continue;
    if (k.some((v) => Math.abs(v - 1) > 0.02)) return true;
  }
  return false;
}

/** A scale track that flattens a visible joint (one axis under 0.2 — not hiding it whole). */
function squashes(sampler) {
  const a = sampler.getOutput().getArray();
  for (let i = 0; i < a.length; i += 3) {
    const k = [a[i], a[i + 1], a[i + 2]].map(Math.abs);
    if (Math.max(...k) >= 0.05 && Math.min(...k) < 0.2) return true;
  }
  return false;
}

/** A LINEAR sampler's value at a time (quaternions slerped). */
function sampleAt(sampler, time) {
  const t = sampler.getInput().getArray();
  const out = sampler.getOutput();
  const size = out.getElementSize();
  const v = out.getArray();
  const at = (i) => Array.from(v.subarray(i * size, i * size + size));
  if (time <= t[0]) return at(0);
  if (time >= t[t.length - 1]) return at(t.length - 1);
  let i = 0;
  while (t[i + 1] < time) i++;
  const u = (time - t[i]) / (t[i + 1] - t[i]);
  const a = at(i);
  const b = at(i + 1);
  if (size !== 4) return a.map((x, k) => x + (b[k] - x) * u);
  let d = a.reduce((sum, x, k) => sum + x * b[k], 0);
  const bb = d < 0 ? b.map((x) => -x) : b;
  d = Math.abs(d);
  if (d > 0.9995) {
    const r = a.map((x, k) => x + (bb[k] - x) * u);
    const l = Math.hypot(...r);
    return r.map((x) => x / l);
  }
  const th = Math.acos(d);
  const sn = Math.sin(th);
  return a.map((x, k) => (Math.sin((1 - u) * th) * x + Math.sin(u * th) * bb[k]) / sn);
}

function quatToMat([x, y, z, w]) {
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
}

/** The rotation nearest to three nearly orthonormal columns (a few polar iterations). */
function orthonormal(cols) {
  let m = [0, 1, 2].map((r) => [0, 1, 2].map((c) => cols[c][r]));
  for (let it = 0; it < 8; it++) {
    const det =
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
      m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
      m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    // inverse transpose = cofactor matrix / det
    const cof = [
      [m[1][1] * m[2][2] - m[1][2] * m[2][1], m[1][2] * m[2][0] - m[1][0] * m[2][2], m[1][0] * m[2][1] - m[1][1] * m[2][0]],
      [m[0][2] * m[2][1] - m[0][1] * m[2][2], m[0][0] * m[2][2] - m[0][2] * m[2][0], m[0][1] * m[2][0] - m[0][0] * m[2][1]],
      [m[0][1] * m[1][2] - m[0][2] * m[1][1], m[0][2] * m[1][0] - m[0][0] * m[1][2], m[0][0] * m[1][1] - m[0][1] * m[1][0]],
    ];
    m = m.map((row, r) => row.map((x, c) => 0.5 * (x + cof[r][c] / det)));
  }
  return m;
}

function matToQuat(m) {
  const tr = m[0][0] + m[1][1] + m[2][2];
  let x, y, z, w;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    w = 0.25 * s; x = (m[2][1] - m[1][2]) / s; y = (m[0][2] - m[2][0]) / s; z = (m[1][0] - m[0][1]) / s;
  } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
    const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2;
    w = (m[2][1] - m[1][2]) / s; x = 0.25 * s; y = (m[0][1] + m[1][0]) / s; z = (m[0][2] + m[2][0]) / s;
  } else if (m[1][1] > m[2][2]) {
    const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2;
    w = (m[0][2] - m[2][0]) / s; x = (m[0][1] + m[1][0]) / s; y = 0.25 * s; z = (m[1][2] + m[2][1]) / s;
  } else {
    const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2;
    w = (m[1][0] - m[0][1]) / s; x = (m[0][2] + m[2][0]) / s; y = (m[1][2] + m[2][1]) / s; z = 0.25 * s;
  }
  const l = Math.hypot(x, y, z, w);
  return [x / l, y / l, z / l, w / l];
}

// Merge with the existing manifest when optimizing a subset.
let manifest = hashes;
if (only.length > 0 && existsSync(MANIFEST)) {
  const prev = Object.fromEntries(
    [...readFileSync(MANIFEST, "utf8").matchAll(/^\s+(\w+): "(\w+)",$/gm)].map((m) => [m[1], m[2]]),
  );
  manifest = { ...prev, ...hashes };
}
const lines = Object.keys(manifest)
  .sort()
  .map((k) => `  ${k}: "${manifest[k]}",`)
  .join("\n");
writeFileSync(
  MANIFEST,
  `// GENERATED by scripts/optimize-models.mjs — do not edit.\n` +
    `// Content hash per shipped model; used as the ?v= cache-busting query.\n` +
    `export const MODEL_HASH: Record<string, string> = {\n${lines}\n};\n`,
);
const pngBytes = readdirSync(SRC)
  .filter((f) => f.endsWith(".png"))
  .reduce((n, f) => n + statSync(join(SRC, f)).size, 0);
console.log(
  `\n${files.length} models: glb ${(before / 1e6).toFixed(1)} MB (+ ${(pngBytes / 1e6).toFixed(1)} MB external png) → ${(
    after / 1e6
  ).toFixed(1)} MB`,
);
