/**
 * Procedural sound effects — everything synthesized with Web Audio, no assets.
 * The AudioContext is created lazily on the first sound (which always follows a
 * user gesture like buying, so autoplay policies are satisfied).
 */

let ctx: AudioContext | null = null;
let muted = typeof localStorage !== "undefined" && localStorage.getItem("dac-mute") === "1";

export function isMuted() {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem("dac-mute", m ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function ac(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

interface ToneOpts {
  type?: OscillatorType;
  vol?: number;
  delay?: number;
  sweep?: number; // target frequency to glide to over the duration
}

function tone(freq: number, dur: number, { type = "sine", vol = 0.12, delay = 0, sweep }: ToneOpts = {}) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (sweep) o.frequency.exponentialRampToValueAtTime(Math.max(1, sweep), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

function thud(dur: number, vol = 0.1, delay = 0) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const frames = Math.ceil(c.sampleRate * dur);
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 700;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t0);
}

export const sfx = {
  buy: () => {
    tone(523, 0.07, { type: "triangle" });
    tone(784, 0.1, { type: "triangle", delay: 0.06 });
  },
  sell: () => {
    tone(660, 0.07, { type: "square", vol: 0.05 });
    tone(392, 0.12, { type: "square", vol: 0.05, delay: 0.06 });
  },
  reroll: () => tone(280, 0.06, { type: "square", vol: 0.05, sweep: 560 }),
  equip: () => {
    tone(880, 0.06, { vol: 0.09 });
    tone(1175, 0.09, { vol: 0.09, delay: 0.05 });
  },
  click: () => tone(600, 0.04, { vol: 0.05 }),
  battleStart: () => tone(220, 0.3, { type: "sawtooth", vol: 0.08, sweep: 660 }),
  hit: () => {
    thud(0.07, 0.09);
    tone(130, 0.08, { vol: 0.1, sweep: 60 });
  },
  shot: () => tone(950, 0.07, { type: "square", vol: 0.04, sweep: 320 }),
  cast: () => {
    tone(440, 0.09, { vol: 0.09 });
    tone(554, 0.09, { vol: 0.09, delay: 0.06 });
    tone(659, 0.14, { vol: 0.11, delay: 0.12 });
  },
  death: () => tone(320, 0.25, { type: "sawtooth", vol: 0.07, sweep: 55 }),
  evolve: () => {
    [392, 494, 587, 784].forEach((f, i) => tone(f, 0.18, { type: "triangle", vol: 0.12, delay: i * 0.09 }));
  },
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: "triangle", vol: 0.11, delay: i * 0.1 }));
  },
  lose: () => {
    [392, 330, 262].forEach((f, i) => tone(f, 0.26, { type: "sawtooth", vol: 0.06, delay: i * 0.13 }));
  },
  drop: () => {
    tone(784, 0.07, { type: "triangle", vol: 0.1, delay: 0.3 });
    tone(1047, 0.12, { type: "triangle", vol: 0.1, delay: 0.38 });
  },
};

// Battle sounds fire many times per second — throttle each kind.
const lastPlayed: Record<string, number> = {};
export function battleSfx(kind: "hit" | "shot" | "cast" | "death") {
  const now = performance.now();
  if (now - (lastPlayed[kind] ?? 0) < 90) return;
  lastPlayed[kind] = now;
  sfx[kind]();
}
