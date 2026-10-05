/**
 * Clip math shared by the model scripts (optimize-models, anim-audit): sampling a glTF
 * animation the way three.js plays it, and posing a skeleton from it.
 */

/** Joint positions in model space for every frame of a clip, at `fps`. */
export function posesOf(clip, joints, fps) {
  const tracks = new Map();
  let dur = 0;
  for (const ch of clip.listChannels()) {
    const s = ch.getSampler();
    dur = Math.max(dur, s.getInput().getMax([])[0]);
    tracks.set(`${ch.getTargetNode().getName()}|${ch.getTargetPath()}`, s);
  }
  const n = Math.max(2, Math.round(dur * fps));
  const out = [];
  for (let f = 0; f <= n; f++) {
    const t = (dur * f) / n;
    const world = new Map();
    const worldOf = (node) => {
      if (world.has(node)) return world.get(node);
      const tr = tracks.get(`${node.getName()}|translation`);
      const rt = tracks.get(`${node.getName()}|rotation`);
      const sc = tracks.get(`${node.getName()}|scale`);
      const m = compose(tr ? sampleAt(tr, t) : node.getTranslation(), rt ? sampleAt(rt, t) : node.getRotation(), sc ? sampleAt(sc, t) : node.getScale());
      const parent = node.getParentNode();
      const w = parent ? mul(worldOf(parent), m) : m;
      world.set(node, w);
      return w;
    };
    out.push(joints.map((j) => { const w = worldOf(j); return [w[12], w[13], w[14]]; }));
  }
  return out;
}

/** Joints that ride along — HUD targets, effect points — rather than make up the body. */
export const isBodyJoint = (j) => !/hud|target|^(tp|cp|gp|fp)\d|point|eff/i.test(j.getName());

/** A LINEAR sampler's value at a time (quaternions interpolated and normalized). */
export function sampleAt(sampler, time) {
  const t = sampler.getInput().getArray();
  const out = sampler.getOutput();
  const size = out.getElementSize();
  const v = out.getArray();
  const at = (i) => Array.from(v.subarray(i * size, i * size + size));
  const norm = out.getNormalized() ? (x) => x : (x) => x;
  if (time <= t[0]) return at(0).map(norm);
  if (time >= t[t.length - 1]) return at(t.length - 1).map(norm);
  let i = 0;
  while (t[i + 1] < time) i++;
  const u = (time - t[i]) / (t[i + 1] - t[i]);
  const a = at(i);
  const b = at(i + 1);
  if (size !== 4) return a.map((x, k) => x + (b[k] - x) * u);
  const d = a.reduce((s, x, k) => s + x * b[k], 0);
  const bb = d < 0 ? b.map((x) => -x) : b;
  const r = a.map((x, k) => x + (bb[k] - x) * u);
  const l = Math.hypot(...r);
  return r.map((x) => x / l);
}

/** column-major 4×4 from translation, quaternion, scale */
export function compose([tx, ty, tz], [x, y, z, w], [sx, sy, sz]) {
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

export function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
