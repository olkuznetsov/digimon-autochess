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

const SRC = "models-src";
const OUT = "public/models";
const MANIFEST = "src/three/model-manifest.ts";
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
      (fixed.length ? `   scale added: ${fixed.join(", ")}` : ""),
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
