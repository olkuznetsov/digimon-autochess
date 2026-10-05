/**
 * Procedural sound effects on the shared graph (engine.ts). Battle sounds are
 * driven by the sim's CombatEvents, so their weight follows the fight: heavy
 * blows boom, super-effective hits ring, deletions glitch apart, and every
 * ultimate archetype has its own stinger (Megas also duck the music).
 */
import type { CombatEvent } from "../game/battle";
import { audio, duck, noise, tone } from "./engine";

export { isMuted, setMuted, isMusicOn, setMusicOn } from "./engine";

const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ---------- battle voices ----------

function melee(heavy: boolean, superEff: boolean, resisted: boolean) {
  const p = rand(0.92, 1.08); // no two blows sound exactly alike
  // body: a short pitched thump
  tone((heavy ? 125 : 165) * p, heavy ? 0.16 : 0.1, { vol: heavy ? 0.34 : 0.22, to: (heavy ? 38 : 52) * p, glide: 0.1 });
  // crack: the contact transient
  noise(heavy ? 0.09 : 0.05, {
    freq: resisted ? 700 : (heavy ? 1300 : 2000) * p,
    q: 0.9,
    vol: resisted ? 0.08 : heavy ? 0.22 : 0.15,
    send: heavy ? 0.25 : 0,
  });
  if (superEff) {
    tone(1320 * p, 0.12, { type: "triangle", vol: 0.05, at: 0.01 });
    tone(1980 * p, 0.16, { type: "triangle", vol: 0.035, at: 0.02, send: 0.3 });
  }
}

function zap(superEff: boolean) {
  const p = rand(0.9, 1.1);
  tone(1500 * p, 0.09, { type: "square", vol: 0.045, to: 280 * p, lowpass: 3200 });
  noise(0.03, { filter: "highpass", freq: 5000, vol: 0.04 });
  // the bolt lands a moment later (the projectile's flight)
  tone(140 * p, 0.08, { vol: 0.14, to: 60, at: 0.14 });
  noise(0.04, { freq: 1800, vol: 0.07, at: 0.14 });
  if (superEff) tone(1760 * p, 0.12, { type: "triangle", vol: 0.035, at: 0.15 });
}

/** "Data deletion": a boom, a hiss dissolving upward, and scattering bit-blips. */
function deletion() {
  tone(95, 0.35, { vol: 0.3, to: 34 });
  noise(0.45, { filter: "highpass", freq: 900, to: 7000, vol: 0.06, attack: 0.05, send: 0.4 });
  for (let i = 0; i < 7; i++) {
    tone(rand(300, 1400) * (1 - i * 0.09), 0.035, { type: "square", vol: 0.03, at: 0.04 + i * 0.035, lowpass: 2600 });
  }
}

/** Every ultimate archetype gets its own stinger; Megas add weight and duck the music. */
function stinger(e: CombatEvent) {
  const mega = (e.stage ?? 1) >= 3;
  // shared charge-up
  tone(220, 0.16, { type: "sawtooth", vol: 0.04, to: 880, lowpass: 2400 });
  switch (e.ult) {
    case "blast":
      tone(80, 0.7, { vol: 0.4, to: 28, at: 0.05 });
      noise(0.6, { filter: "lowpass", freq: 1400, to: 160, vol: 0.3, at: 0.05, send: 0.45 });
      break;
    case "strike":
      tone(2000, 0.28, { type: "sawtooth", vol: 0.07, to: 110, lowpass: 5000, at: 0.03 });
      tone(3000, 0.24, { type: "square", vol: 0.03, to: 160, lowpass: 5000, at: 0.03 });
      tone(120, 0.2, { vol: 0.3, to: 40, at: 0.09 });
      noise(0.12, { freq: 1500, vol: 0.18, at: 0.09, send: 0.3 });
      break;
    case "frost":
      [2093, 2637, 3136, 4186].forEach((f, i) =>
        tone(f * rand(0.98, 1.02), rand(0.45, 0.8), { vol: 0.035, at: 0.03 + i * 0.03, send: 0.6 }),
      );
      noise(0.5, { filter: "highpass", freq: 6000, vol: 0.06, send: 0.5 });
      tone(180, 0.25, { vol: 0.18, to: 70 });
      break;
    case "barrage":
      for (let i = 0; i < 4; i++) {
        tone(900 * rand(0.9, 1.1), 0.05, { type: "square", vol: 0.04, to: 380, at: i * 0.065, lowpass: 3000 });
        noise(0.035, { freq: 2200, vol: 0.11, at: i * 0.065 + 0.01 });
      }
      break;
    case "guard":
      [262, 330, 392].forEach((f) => tone(f, 0.7, { type: "triangle", vol: 0.06, attack: 0.02, send: 0.5 }));
      tone(1047, 0.8, { vol: 0.03, at: 0.05, send: 0.7 });
      break;
    case "heal":
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, { vol: 0.06, at: i * 0.07, send: 0.55 }));
      break;
    case "buff":
      [220, 330, 440].forEach((f) => tone(f, 0.45, { type: "sawtooth", vol: 0.035, attack: 0.06, lowpass: 1800 }));
      tone(880, 0.4, { type: "triangle", vol: 0.04, at: 0.1, send: 0.5 });
      break;
  }
  if (mega) {
    duck(0.3, 0.45, 0.9);
    tone(58, 0.9, { vol: 0.34, to: 30, at: 0.04 });
    // bright minor stab
    [440, 523, 659, 880].forEach((f) =>
      tone(f, 0.55, { type: "sawtooth", vol: 0.028, lowpass: 3500, attack: 0.01, at: 0.04, send: 0.5 }),
    );
  }
}

// Battle sounds fire many times per second — each kind is throttled, heavy ones less.
const lastPlayed: Record<string, number> = {};
function allow(kind: string, gapMs: number) {
  const now = performance.now();
  if (now - (lastPlayed[kind] ?? 0) < gapMs) return false;
  lastPlayed[kind] = now;
  return true;
}

export function battleSfx(e: CombatEvent) {
  if (!audio()) return;
  if (e.kind === "cast") {
    if ((e.stage ?? 1) >= 3 || allow("cast", 120)) stinger(e);
    return;
  }
  if (e.kind === "death") {
    if (allow("death", 140)) deletion();
    return;
  }
  // a shot leaving: its hit sounds when it lands
  if (e.kind === "shot") return;
  // Wind's dodge: a whoosh; Fire's burn: a soft crackle
  if (e.tag === "miss") {
    if (allow("miss", 140)) noise(0.06, { filter: "highpass", freq: 2600, vol: 0.05 });
    return;
  }
  if (e.tag === "burn") {
    if (allow("burn", 220)) noise(0.05, { filter: "bandpass", freq: 900, vol: 0.05 });
    return;
  }
  // an ultimate's own hits are carried by its stinger — just a light tick
  if (e.ability) {
    if (allow("ability", 90)) noise(0.05, { freq: 1600, vol: 0.1 });
    return;
  }
  const superEff = (e.mult ?? 1) >= 1.1;
  const resisted = (e.mult ?? 1) <= 0.9;
  if (e.heavy) {
    if (allow("heavy", 110)) melee(true, superEff, resisted);
  } else if (e.ranged) {
    if (allow("shot", 60)) zap(superEff);
  } else if (allow("hit", 55)) {
    melee(false, superEff, resisted);
  }
}

// ---------- game / UI sounds ----------

export const sfx = {
  buy: () => {
    tone(523, 0.07, { type: "triangle" });
    tone(784, 0.1, { type: "triangle", at: 0.06 });
  },
  sell: () => {
    tone(660, 0.07, { type: "square", vol: 0.05 });
    tone(392, 0.12, { type: "square", vol: 0.05, at: 0.06 });
  },
  reroll: () => {
    tone(280, 0.07, { type: "square", vol: 0.05, to: 560 });
    noise(0.08, { filter: "highpass", freq: 3000, to: 8000, vol: 0.03 });
  },
  equip: () => {
    tone(880, 0.06, { vol: 0.09 });
    tone(1175, 0.09, { vol: 0.09, at: 0.05, send: 0.3 });
  },
  click: () => tone(600, 0.04, { vol: 0.05 }),
  /** the partner eats: three soft bites and a happy chirp */
  munch: () => {
    [0, 0.15, 0.3].forEach((t) => noise(0.05, { freq: 900, q: 1.5, vol: 0.07, at: t }));
    tone(587, 0.1, { type: "triangle", vol: 0.07, at: 0.44, to: 880 });
  },
  /** a training blow */
  punch: () => {
    tone(150, 0.12, { vol: 0.28, to: 60 });
    noise(0.06, { freq: 1600, vol: 0.08 });
  },
  /** a riser into the "FIGHT!" hit, timed to the 0.9 s battle intro */
  battleStart: () => {
    noise(0.85, { freq: 400, to: 5000, q: 1.2, vol: 0.09, attack: 0.7 });
    tone(110, 0.85, { type: "sawtooth", vol: 0.05, to: 440, lowpass: 1800, attack: 0.6 });
    tone(150, 0.3, { vol: 0.4, to: 40, at: 0.88 });
    noise(0.5, { filter: "highpass", freq: 3500, vol: 0.12, at: 0.88, send: 0.5 });
  },
  /** boss rounds: a low horn and war drums instead of the usual riser */
  bossIntro: () => {
    duck(0.25, 1.2, 1.2);
    [55, 55 * 1.498].forEach((f, i) =>
      tone(f, 1.6, { type: "sawtooth", vol: 0.09, attack: 0.35, lowpass: 520, detune: i ? 6 : -6, send: 0.4 }),
    );
    [0, 0.32, 0.64, 0.88].forEach((t, i) => {
      tone(i === 3 ? 70 : 90, 0.3, { vol: i === 3 ? 0.45 : 0.32, to: 40, at: t });
      noise(0.12, { filter: "lowpass", freq: 900, vol: 0.12, at: t, send: 0.35 });
    });
  },
  evolve: () => {
    [392, 494, 587, 784].forEach((f, i) => tone(f, 0.22, { type: "triangle", vol: 0.12, at: i * 0.09, send: 0.4 }));
    noise(0.6, { filter: "highpass", freq: 2000, to: 9000, vol: 0.05, attack: 0.3, send: 0.5 });
    tone(1568, 0.7, { vol: 0.04, at: 0.36, send: 0.7 });
  },
  win: () => {
    duck(0.4, 0.8, 1);
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, { type: "triangle", vol: 0.11, at: i * 0.1, send: 0.4 }));
    [523, 659, 784].forEach((f) => tone(f * 2, 0.9, { type: "sawtooth", vol: 0.02, at: 0.4, lowpass: 3000, send: 0.5 }));
  },
  lose: () => {
    duck(0.4, 0.8, 1);
    [392, 330, 262].forEach((f, i) =>
      tone(f, 0.32, { type: "sawtooth", vol: 0.06, at: i * 0.14, lowpass: 1400 - i * 350, send: 0.3 }),
    );
    tone(65, 0.8, { vol: 0.2, to: 40, at: 0.3 });
  },
  drop: () => {
    tone(784, 0.07, { type: "triangle", vol: 0.1, at: 0.3 });
    tone(1047, 0.14, { type: "triangle", vol: 0.1, at: 0.38, send: 0.4 });
  },
};
