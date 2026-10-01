/**
 * Procedural synthwave soundtrack: pad chords, a driving bass, an echoing arp and
 * drums, generated live by a look-ahead step sequencer on the audio clock.
 *
 * One song, several intensities: prep is filtered and sparse, battle opens up with
 * four-on-the-floor drums, boss rounds switch to a darker progression, and the
 * result screen breathes out. A heartbeat joins when the player's health is low.
 * Layers crossfade, so mode changes never cut a note.
 */
import {
  audio,
  isMusicOn,
  isMuted,
  isUnlocked,
  mtof,
  noise,
  onAudioChange,
  setMusicBrightness,
  tone,
  type Graph,
} from "./engine";

export type MusicMode = "prep" | "battle" | "boss" | "result";

const BPM = 104;
const STEP = 60 / BPM / 4; // one 16th note
const BAR = STEP * 16;

// [bass root, three pad notes voiced around middle C] (MIDI)
const Am = [45, 57, 60, 64];
const F = [41, 57, 60, 65];
const C = [48, 55, 60, 64];
const G = [43, 55, 59, 62];
const Em = [40, 55, 59, 64];
const Dm = [38, 57, 62, 65];
const Bb = [46, 58, 62, 65];
const Gm = [43, 55, 58, 62];
const A = [45, 57, 61, 64];

const CALM = [Am, F, C, G];
const LIFT = [F, G, Em, Am];
const BOSS = [Dm, Bb, Gm, A];

const MIX: Record<MusicMode, { pad: number; bass: number; arp: number; drums: number; bright: number }> = {
  prep: { pad: 1, bass: 0.7, arp: 0.8, drums: 0.6, bright: 2800 },
  battle: { pad: 0.7, bass: 1, arp: 0.9, drums: 1, bright: 9000 },
  boss: { pad: 0.85, bass: 1, arp: 0.7, drums: 1, bright: 7000 },
  result: { pad: 1, bass: 0.3, arp: 0.45, drums: 0.2, bright: 2000 },
};

interface Layers {
  ctx: AudioContext;
  pad: GainNode;
  bass: GainNode;
  arp: GainNode;
  drums: GainNode;
}

let layers: Layers | null = null;
let mode: MusicMode = "prep";
let tension = false;
let timer: ReturnType<typeof setInterval> | null = null;
let nextTime = 0;
let step = 0;
let bar = 0;
let chord = Am;

function ensureLayers(g: Graph): Layers {
  if (layers && layers.ctx === g.ctx) return layers;
  const c = g.ctx;
  const layer = () => {
    const n = c.createGain();
    n.gain.value = 0;
    n.connect(g.music);
    return n;
  };
  const arp = layer();
  // dotted-8th echo, darkened on every repeat
  const delay = c.createDelay(1);
  delay.delayTime.value = STEP * 3;
  const damp = c.createBiquadFilter();
  damp.type = "lowpass";
  damp.frequency.value = 2200;
  const fb = c.createGain();
  fb.gain.value = 0.34;
  const wet = c.createGain();
  wet.gain.value = 0.4;
  arp.connect(delay);
  delay.connect(damp).connect(fb).connect(delay);
  damp.connect(wet).connect(g.music);
  layers = { ctx: c, pad: layer(), bass: layer(), arp, drums: layer() };
  return layers;
}

function applyMix(fade: number) {
  const g = audio();
  if (!g || !layers) return;
  const m = MIX[mode];
  const t = g.ctx.currentTime;
  layers.pad.gain.setTargetAtTime(m.pad, t, fade / 3);
  layers.bass.gain.setTargetAtTime(m.bass, t, fade / 3);
  layers.arp.gain.setTargetAtTime(m.arp, t, fade / 3);
  layers.drums.gain.setTargetAtTime(m.drums, t, fade / 3);
  setMusicBrightness(m.bright, fade);
}

// ---------- voices ----------

/** Sustained detuned-saw chord for one bar (attack, hold, release). */
function pad(g: Graph, L: Layers, notes: number[], t: number) {
  const c = g.ctx;
  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(1, t + 0.4);
  out.gain.setValueAtTime(1, t + BAR - 0.05);
  out.gain.exponentialRampToValueAtTime(0.0001, t + BAR + 0.6);
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = mode === "prep" || mode === "result" ? 1100 : 1700;
  f.Q.value = 0.6;
  f.connect(out);
  out.connect(L.pad);
  const send = c.createGain();
  send.gain.value = 0.5;
  out.connect(send).connect(g.musicVerb);
  for (const n of notes) {
    for (const cents of [-8, 8]) {
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = mtof(n);
      o.detune.value = cents;
      const v = c.createGain();
      v.gain.value = 0.022;
      o.connect(v).connect(f);
      o.start(t);
      o.stop(t + BAR + 0.7);
    }
  }
}

/** Plucky resonant saw bass with a filter envelope. */
function bassNote(g: Graph, L: Layers, midi: number, t: number, len: number) {
  const c = g.ctx;
  const o = c.createOscillator();
  o.type = "sawtooth";
  o.frequency.value = mtof(midi);
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.Q.value = 6;
  f.frequency.setValueAtTime(1500, t);
  f.frequency.exponentialRampToValueAtTime(260, t + 0.16);
  const v = c.createGain();
  v.gain.setValueAtTime(0.0001, t);
  v.gain.exponentialRampToValueAtTime(0.13, t + 0.006);
  v.gain.exponentialRampToValueAtTime(0.07, t + 0.12);
  v.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(f).connect(v).connect(L.bass);
  o.start(t);
  o.stop(t + len + 0.05);
}

function kick(L: Layers, t: number, vol = 0.55) {
  tone(150, 0.3, { vol, to: 42, glide: 0.1, time: t, out: L.drums });
}
function snare(g: Graph, L: Layers, t: number) {
  noise(0.2, { freq: 1900, q: 0.7, vol: 0.22, time: t, out: L.drums, send: 0.5, sendTo: g.musicVerb });
  tone(190, 0.09, { type: "triangle", vol: 0.1, time: t, out: L.drums });
}
function hat(L: Layers, t: number, open: boolean, vol = 0.05) {
  noise(open ? 0.13 : 0.035, { filter: "highpass", freq: 7500, vol, time: t, out: L.drums });
}
function heartbeat(g: Graph, t: number) {
  tone(62, 0.14, { vol: 0.5, to: 44, time: t, out: g.music });
  tone(55, 0.12, { vol: 0.34, to: 40, time: t + 0.17, out: g.music });
}

// arp walks the chord tones an octave up; the last note reaches for the top
const ARP = [0, 1, 2, 1, 0, 1, 2, 3];

function scheduleStep(g: Graph, L: Layers, i: number, t: number) {
  const busy = mode === "battle" || mode === "boss";
  if (i === 0) {
    const prog = mode === "boss" ? BOSS : Math.floor(bar / 8) % 2 === 0 ? CALM : LIFT;
    chord = prog[bar % 4];
    bar++;
    pad(g, L, chord.slice(1), t);
  }

  // bass: driving octave 8ths in battle, long roots otherwise
  if (busy) {
    if (i % 2 === 0) bassNote(g, L, chord[0] + (i % 4 === 2 ? 12 : 0), t, STEP * 1.7);
  } else if (i === 0 || i === 8) {
    bassNote(g, L, chord[0], t, STEP * 7);
  }

  // arp: 16ths in battle, 8ths when calm
  if (busy || i % 2 === 0) {
    const k = ARP[(busy ? i : i / 2) % ARP.length];
    const midi = k === 3 ? chord[1] + 24 : chord[1 + k] + 12;
    tone(mtof(midi), STEP * 0.9, {
      type: busy ? "square" : "triangle",
      vol: busy ? 0.022 : 0.03,
      lowpass: busy ? 3000 : 1800,
      time: t,
      out: L.arp,
    });
  }

  // drums
  if (busy) {
    if (i % 4 === 0) kick(L, t);
    if (i === 4 || i === 12) snare(g, L, t);
    if (i % 2 === 0) hat(L, t, i % 4 === 2);
    else if (mode === "boss") hat(L, t, false, 0.025);
    if (mode === "boss" && i === 14 && bar % 2 === 0) kick(L, t, 0.4);
  } else if (mode === "prep") {
    if (i === 0) kick(L, t, 0.35);
    if (i % 4 === 2) hat(L, t, false, 0.03);
  }

  if (tension && (i === 0 || i === 8)) heartbeat(g, t);
}

function tick() {
  const g = audio();
  if (!g || g.ctx.state !== "running") return;
  const L = ensureLayers(g);
  const now = g.ctx.currentTime;
  // first tick, or the main thread stalled / the tab was hidden: skip ahead rather
  // than firing a burst of late notes
  if (nextTime < now) nextTime = now + 0.06;
  while (nextTime < now + 0.15) {
    scheduleStep(g, L, step % 16, nextTime);
    nextTime += STEP;
    step++;
  }
}

function sync() {
  const want = isMusicOn() && !isMuted() && isUnlocked();
  if (want && !timer) {
    const g = audio();
    if (!g) return;
    ensureLayers(g);
    step = 0; // start on a downbeat
    nextTime = 0;
    applyMix(2.5);
    timer = setInterval(tick, 25);
    tick();
  } else if (!want && timer) {
    clearInterval(timer);
    timer = null;
    const g = audio();
    if (g && layers) {
      const t = g.ctx.currentTime;
      for (const n of [layers.pad, layers.bass, layers.arp, layers.drums]) n.gain.setTargetAtTime(0, t, 0.15);
    }
  }
}
onAudioChange(sync);

export const music = {
  setMode(m: MusicMode) {
    if (m === mode) return;
    mode = m;
    if (timer) applyMix(m === "battle" || m === "boss" ? 0.6 : 1.5);
  },
  setTension(on: boolean) {
    tension = on;
  },
};
