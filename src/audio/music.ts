/**
 * The soundtrack: instrumentals Sasha made in Suno in the mood of Digimon Adventure, two
 * versions of each theme taking turns, so a long session doesn't loop one track:
 * - menu and island: the main menu and planning on the board (File Island — a take each);
 * - battle: a fight (Digivolve!);
 * - boss: a boss round (Black Gears);
 * - final: the last boss, Lucemon (Fallen Angel);
 * - victory: a run or a VS match won (Crest of Light), then back to the island.
 *
 * Two <audio> decks play them into the engine's music bus, so mute, the music volume and
 * ducking all apply; every change of mood crossfades. Each track is fetched whole and
 * played from a blob: the hosts (Pages, the Workers mirror) answer byte-range requests
 * with the whole file, and Safari's media loader needs ranges — a blob has them. (Decoded
 * into Web Audio, a three-minute track would take ~60 MB; compressed in a blob, ~3 MB.)
 * The likely next theme is fetched in the background, so a fight's music starts at once.
 *
 * iOS lets an element play from script only once a tap has played it: taps call
 * music.sync() (the title screen's, then the game's capture listeners), which gives both
 * decks a silent first play. A heartbeat joins a fight when the tamer's health runs low.
 */
import { audio, isMusicOn, isMuted, isUnlocked, onAudioChange, setMusicBrightness, silentWavUrl, tone, type Graph } from "./engine";

export type Theme = "menu" | "island" | "battle" | "boss" | "final" | "victory";

const TRACKS: Record<Theme, string[]> = {
  // the two takes of File Island: one for the menu, the other for planning on the board
  menu: ["/music/file-island-1.mp3"],
  island: ["/music/file-island-2.mp3"],
  battle: ["/music/digivolve-1.mp3", "/music/digivolve-2.mp3"],
  boss: ["/music/black-gears-1.mp3", "/music/black-gears-2.mp3"],
  final: ["/music/fallen-angel-1.mp3", "/music/fallen-angel-2.mp3"],
  victory: ["/music/crest-of-light-1.mp3", "/music/crest-of-light-2.mp3"],
};
/** what to fetch ahead while a theme plays */
const NEXT: Record<Theme, Theme> = { menu: "island", island: "battle", battle: "island", boss: "island", final: "victory", victory: "island" };
/** the tracks are mastered loud; the sound effects should sit on top */
const LEVEL = 0.55;
const FADE_IN = 0.8;
const FADE_OUT = 1.2;

interface Deck {
  el: HTMLAudioElement;
  gain: GainNode;
}

let decks: Deck[] | null = null;
/** elements a tap has played once (iOS lets those play from script later) */
const primed = new WeakSet<HTMLAudioElement>();
/** the deck playing the current theme */
let active = 0;
/** what the game wants */
let theme: Theme = "island";
/** what the active deck plays, or is fetching (null: the music is stopped) */
let playing: Theme | null = null;
/** which version of each theme comes next — a random start, then they alternate */
const turn = Object.fromEntries((Object.keys(TRACKS) as Theme[]).map((t) => [t, Math.floor(Math.random() * 2)])) as Record<Theme, number>;
/** bumped by every start, so a fetch that lands late doesn't play over a newer choice */
let ticket = 0;

/** a track as a blob URL; the last few are kept, older ones released */
const blobs = new Map<string, Promise<string>>();
function load(path: string): Promise<string> {
  let p = blobs.get(path);
  if (!p) {
    p = fetch(path)
      .then((r) => {
        if (!r.ok) throw new Error(`music ${r.status}`);
        return r.blob();
      })
      .then((b) => URL.createObjectURL(b));
    p.catch(() => blobs.delete(path));
    blobs.set(path, p);
    for (const [old, url] of blobs) {
      if (blobs.size <= 4) break;
      if (old === path) continue;
      void url.then((u) => {
        if (decks?.some((d) => d.el.src === u)) return; // on a deck: keep it
        blobs.delete(old);
        URL.revokeObjectURL(u);
      });
      break;
    }
  }
  return p;
}
const take = (t: Theme) => TRACKS[t][turn[t] % TRACKS[t].length];

function ensureDecks(g: Graph): Deck[] {
  if (decks) return decks;
  decks = [0, 1].map(() => {
    const el = new Audio();
    el.setAttribute("playsinline", "");
    const gain = g.ctx.createGain();
    gain.gain.value = 0;
    g.ctx.createMediaElementSource(el).connect(gain).connect(g.music);
    const deck = { el, gain };
    el.addEventListener("ended", () => {
      if (decks?.[active] !== deck || !playing) return;
      // a track ran out: the other version of the theme, or after a victory, the island
      start(g, theme === "victory" ? "island" : theme);
    });
    return deck;
  });
  return decks;
}

/** each deck's first play, silent — inside a tap it lets the deck play later on iOS */
function prime(D: Deck[]) {
  for (const d of D) {
    // never over a deck that holds a track (playing, or about to)
    if (primed.has(d.el) || !d.el.paused || d.el.src.startsWith("blob:")) continue;
    const el = d.el;
    el.src = silentWavUrl();
    void el
      .play()
      .then(() => {
        primed.add(el);
        el.pause();
      })
      .catch(() => {});
  }
}

function fade(g: Graph, d: Deck, to: number, seconds: number) {
  const p = d.gain.gain;
  const t = g.ctx.currentTime;
  p.cancelScheduledValues(t);
  p.setValueAtTime(p.value, t);
  p.linearRampToValueAtTime(to, t + seconds);
}

/** Crossfade to the next version of a theme on the other deck. */
function start(g: Graph, next: Theme) {
  const D = ensureDecks(g);
  const out = D[active];
  if (playing) {
    fade(g, out, 0, FADE_OUT);
    setTimeout(() => {
      if (D[active] !== out) out.el.pause();
    }, FADE_OUT * 1000 + 60);
  }
  active = 1 - active;
  const d = D[active];
  theme = next;
  playing = next;
  const path = take(next);
  turn[next]++;
  const my = ++ticket;
  fade(g, d, 0, 0.05);
  void load(path)
    .then((url) => {
      if (my !== ticket) return; // a newer start took over while this one was fetching
      d.el.src = url;
      fade(g, d, LEVEL, FADE_IN);
      return d.el.play().then(() => {
        primed.add(d.el);
        void load(take(NEXT[next])).catch(() => {});
      });
    })
    .catch(() => {
      // not allowed yet (no tap since load, on iOS) or offline: the next tap's sync() retries
      if (my === ticket) playing = null;
    });
}

function stop() {
  if (!decks || !playing) return;
  playing = null;
  ticket++;
  const g = audio();
  const D = decks;
  if (g) for (const d of D) fade(g, d, 0, 0.4);
  setTimeout(() => {
    if (!playing) for (const d of D) d.el.pause();
  }, 450);
}

function sync() {
  const want = isMusicOn() && !isMuted() && isUnlocked();
  if (!want) return stop();
  const g = audio();
  if (!g) return;
  // the tracks are mixed already: keep the bus's lowpass (made for the old synth) open
  setMusicBrightness(20000, 0.3);
  const D = ensureDecks(g);
  if (playing !== theme) start(g, theme);
  prime(D);
}
onAudioChange(sync);

// a hidden tab mustn't keep playing: the engine suspends its clock, this pauses the track
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!decks || !playing) return;
    const el = decks[active].el;
    if (document.hidden) el.pause();
    else if (el.src.startsWith("blob:")) void el.play().catch(() => {});
  });
}

let beat: ReturnType<typeof setInterval> | null = null;
function heartbeat() {
  const g = audio();
  if (!g || !playing || playing === "island" || playing === "victory") return;
  const t = g.ctx.currentTime + 0.02;
  tone(62, 0.14, { vol: 0.5, to: 44, time: t, out: g.music });
  tone(55, 0.12, { vol: 0.34, to: 40, time: t + 0.17, out: g.music });
}

export const music = {
  /** start (or resume) what should be playing — call it from taps */
  sync,
  setTheme(t: Theme) {
    if (t === theme) return;
    theme = t;
    sync();
  },
  /** low health: a heartbeat under the fight */
  setTension(on: boolean) {
    if (on && !beat) beat = setInterval(heartbeat, 860);
    else if (!on && beat) {
      clearInterval(beat);
      beat = null;
    }
  },
};

if (import.meta.env.DEV)
  Object.assign(window, {
    __musicState: () => ({
      theme,
      playing,
      active,
      decks: decks?.map((d) => ({ src: d.el.src.slice(0, 40), paused: d.el.paused, time: Math.round(d.el.currentTime), gain: +d.gain.gain.value.toFixed(2) })),
      cached: [...blobs.keys()],
    }),
  });
