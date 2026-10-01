/**
 * Shared Web Audio graph for sound effects and music — everything is synthesized,
 * there are no audio assets.
 *
 *   sfx voices ──► sfx bus ───────────────┐
 *                  └► sfx reverb ─────────┤
 *   music voices ► music bus ► tone ► duck ┼─► master (mute) ─► compressor ─► out
 *                  └► music reverb ───────┘
 *
 * The context is created lazily. Browsers only let it run after a user gesture,
 * so the AudioDirector unlocks it on the first pointer/key press; every sound
 * before that is silently skipped.
 */

const LS_MUTE = "dac-mute";
const LS_MUSIC = "dac-music";

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}
function writeFlag(key: string, v: boolean) {
  try {
    localStorage.setItem(key, v ? "1" : "0");
  } catch {
    /* private mode: settings just don't persist */
  }
}

export interface Graph {
  ctx: AudioContext;
  sfx: GainNode;
  sfxVerb: GainNode;
  music: GainNode;
  musicVerb: GainNode;
  /** 2 s of white noise, shared by every percussive voice */
  noise: AudioBuffer;
}

const MASTER = 0.9;
/** player volume settings (0..1) times each bus's mix level */
const SFX_MIX = 0.85;
const MUSIC_MIX = 0.8;
let sfxVolume = 1;
let musicVolume = 1;
let graph: Graph | null = null;
let master: GainNode | null = null;
let duckGain: GainNode | null = null;
let musicTone: BiquadFilterNode | null = null;
let muted = readFlag(LS_MUTE, false);
let musicOn = readFlag(LS_MUSIC, true);
const listeners = new Set<() => void>();

/** A decaying-noise impulse response: a cheap, pleasant plate-like reverb. */
function impulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function reverb(ctx: AudioContext, into: AudioNode, wet: number): GainNode {
  const send = ctx.createGain();
  const conv = ctx.createConvolver();
  conv.buffer = impulse(ctx, 2.2, 3);
  const ret = ctx.createGain();
  ret.gain.value = wet;
  send.connect(conv).connect(ret).connect(into);
  return send;
}

function build(): Graph | null {
  let ctx: AudioContext;
  try {
    ctx = new AudioContext();
  } catch {
    return null;
  }
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.knee.value = 8;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.2;
  comp.connect(ctx.destination);

  master = ctx.createGain();
  master.gain.value = muted ? 0 : MASTER;
  master.connect(comp);

  const sfx = ctx.createGain();
  sfx.gain.value = SFX_MIX * sfxVolume;
  sfx.connect(master);
  const sfxVerb = reverb(ctx, master, 0.28);

  const music = ctx.createGain();
  music.gain.value = MUSIC_MIX * musicVolume;
  musicTone = ctx.createBiquadFilter();
  musicTone.type = "lowpass";
  musicTone.frequency.value = 2600;
  musicTone.Q.value = 0.4;
  duckGain = ctx.createGain();
  music.connect(musicTone).connect(duckGain).connect(master);
  const musicVerb = reverb(ctx, musicTone, 0.4);

  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  return { ctx, sfx, sfxVerb, music, musicVerb, noise };
}

/** The live graph, or null while muted / before audio is available. */
export function audio(): Graph | null {
  if (muted) return null;
  if (!graph) graph = build();
  if (graph && graph.ctx.state === "suspended" && !document.hidden) void graph.ctx.resume();
  return graph;
}

let unlocked = false;
export const isUnlocked = () => unlocked;

/** Call from a user gesture: creates/resumes the context so sound can start. */
export function unlockAudio() {
  const g = audio();
  if (g && g.ctx.state !== "running") void g.ctx.resume();
  if (unlocked) return;
  unlocked = true;
  listeners.forEach((f) => f());
}

export function isMuted() {
  return muted;
}
export function setMuted(m: boolean) {
  muted = m;
  writeFlag(LS_MUTE, m);
  if (graph && master) master.gain.setTargetAtTime(m ? 0 : MASTER, graph.ctx.currentTime, 0.04);
  listeners.forEach((f) => f());
}

export function isMusicOn() {
  return musicOn;
}
export function setMusicOn(on: boolean) {
  musicOn = on;
  writeFlag(LS_MUSIC, on);
  listeners.forEach((f) => f());
}

/** Notified when mute / music settings change or audio unlocks. */
export function onAudioChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** Pull the music down under a big moment, then let it swell back. */
export function duck(depth = 0.35, hold = 0.3, release = 0.6) {
  if (!graph || !duckGain) return;
  const t = graph.ctx.currentTime;
  const g = duckGain.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.setTargetAtTime(depth, t, 0.012);
  g.setTargetAtTime(1, t + hold, release / 3);
}

/** Player volume settings, 0..1 each. */
export function setBusVolumes(music: number, sfx: number) {
  musicVolume = music;
  sfxVolume = sfx;
  if (!graph) return;
  const t = graph.ctx.currentTime;
  graph.music.gain.setTargetAtTime(MUSIC_MIX * music, t, 0.05);
  graph.sfx.gain.setTargetAtTime(SFX_MIX * sfx, t, 0.05);
}

/** Open or close the music's lowpass (calm prep vs bright battle). */
export function setMusicBrightness(hz: number, seconds = 1.2) {
  if (!graph || !musicTone) return;
  musicTone.frequency.setTargetAtTime(hz, graph.ctx.currentTime, seconds / 3);
}

if (import.meta.env.DEV) Object.assign(window, { __audio: () => ({ graph, master, duckGain, musicTone }) });

// the context keeps running in a background tab and schedulers there drift;
// suspend while hidden (the music scheduler re-syncs its clock on return)
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!graph) return;
    if (document.hidden) void graph.ctx.suspend();
    else if (!muted) void graph.ctx.resume();
  });
}

// ---------- voices ----------

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export interface ToneOpts {
  type?: OscillatorType;
  vol?: number;
  /** seconds from now */
  at?: number;
  /** absolute context time (music scheduling); overrides `at` */
  time?: number;
  /** glide to this frequency (exponential) over `glide` seconds (default: the whole note) */
  to?: number;
  glide?: number;
  attack?: number;
  detune?: number;
  lowpass?: number;
  q?: number;
  /** reverb send level */
  send?: number;
  out?: AudioNode;
  sendTo?: AudioNode;
}

/** One enveloped oscillator note. */
export function tone(freq: number, dur: number, o: ToneOpts = {}) {
  const g = audio();
  if (!g) return;
  const c = g.ctx;
  const t0 = o.time ?? c.currentTime + (o.at ?? 0);
  const osc = c.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(freq, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t0 + (o.glide ?? dur));
  if (o.detune) osc.detune.value = o.detune;
  const env = c.createGain();
  const a = o.attack ?? 0.004;
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(o.vol ?? 0.1, t0 + a);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(a + 0.02, dur));
  let head: AudioNode = osc;
  if (o.lowpass) {
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = o.lowpass;
    f.Q.value = o.q ?? 0.7;
    head = head.connect(f);
  }
  head.connect(env);
  env.connect(o.out ?? g.sfx);
  if (o.send) {
    const s = c.createGain();
    s.gain.value = o.send;
    env.connect(s).connect(o.sendTo ?? g.sfxVerb);
  }
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export interface NoiseOpts {
  vol?: number;
  at?: number;
  time?: number;
  filter?: BiquadFilterType;
  freq?: number;
  /** sweep the filter to this frequency over the burst */
  to?: number;
  q?: number;
  attack?: number;
  send?: number;
  out?: AudioNode;
  sendTo?: AudioNode;
}

/** A filtered noise burst (hits, snares, hats, whooshes). */
export function noise(dur: number, o: NoiseOpts = {}) {
  const g = audio();
  if (!g) return;
  const c = g.ctx;
  const t0 = o.time ?? c.currentTime + (o.at ?? 0);
  const src = c.createBufferSource();
  src.buffer = g.noise;
  const f = c.createBiquadFilter();
  f.type = o.filter ?? "bandpass";
  f.frequency.setValueAtTime(o.freq ?? 1200, t0);
  if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);
  f.Q.value = o.q ?? 0.8;
  const env = c.createGain();
  const a = o.attack ?? 0.002;
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(o.vol ?? 0.1, t0 + a);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(a + 0.01, dur));
  src.connect(f).connect(env).connect(o.out ?? g.sfx);
  if (o.send) {
    const s = c.createGain();
    s.gain.value = o.send;
    env.connect(s).connect(o.sendTo ?? g.sfxVerb);
  }
  src.start(t0, Math.random() * 1.5);
  src.stop(t0 + dur + 0.03);
}
