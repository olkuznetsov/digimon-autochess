/**
 * Game-feel state shared by the renderer: hit-stop, slow-motion, camera trauma and
 * a full-screen flash. Purely cosmetic — hit-stop/slow-mo only delay WHEN fixed sim
 * steps run in real time, never what they compute, so battles (and PvP hashes) stay
 * identical.
 *
 * `now` is the effects clock: it advances with `timeScale` (0 during hit-stop), so
 * impacts, numbers and animations freeze together, and it keeps running after the
 * battle ends so the final blow still plays out.
 */
export const juice = {
  now: 0,
  timeScale: 1,
  trauma: 0,
  hitStop: 0,
  slowMo: 0,
  slowScale: 1,
  flash: 0,
  flashColor: "#ffffff",
  /** real seconds since the last hit-stop / slow-mo — both are rationed in busy fights */
  sinceStop: 9,
  sinceSlow: 9,
  /** settings: camera shake / screen flashes on/off (reduced motion) */
  shakeEnabled: true,
  flashEnabled: true,
  /** battle playback speed (2× button) — effects and animations keep pace with the sim */
  speed: 1,
};

/** Advance once per frame (CameraRig does it, before everything else). */
export function tickJuice(dt: number) {
  const step = Math.min(dt, 0.1);
  juice.sinceStop += step;
  juice.sinceSlow += step;
  if (juice.hitStop > 0) {
    juice.hitStop -= step;
    juice.timeScale = 0;
  } else if (juice.slowMo > 0) {
    juice.slowMo -= step;
    juice.timeScale = juice.slowScale;
  } else {
    juice.timeScale = 1;
  }
  juice.now += step * juice.timeScale * juice.speed;
  juice.trauma = Math.max(0, juice.trauma - step * 1.5);
  juice.flash = Math.max(0, juice.flash - step * 3.2);
}

export function addTrauma(amount: number) {
  if (juice.shakeEnabled) juice.trauma = Math.min(1, juice.trauma + amount);
}

/** Freeze the fight for a beat. Rationed: at most one every 0.22 s. */
export function hitStop(seconds: number) {
  if (juice.sinceStop < 0.22) return;
  juice.sinceStop = 0;
  juice.hitStop = Math.max(juice.hitStop, seconds);
}

/** Slow the fight down for a beat. `minGap` rations it (real seconds since the last
 *  one); returns whether it fired, so callers can pair it with a flash. */
export function slowMo(seconds: number, scale: number, minGap = 0): boolean {
  if (juice.sinceSlow < minGap) return false;
  juice.sinceSlow = 0;
  juice.slowMo = Math.max(juice.slowMo, seconds);
  juice.slowScale = scale;
  return true;
}

export function screenFlash(strength: number, color = "#ffffff") {
  if (!juice.flashEnabled) return;
  juice.flash = Math.max(juice.flash, strength);
  juice.flashColor = color;
}

export function resetJuice() {
  juice.hitStop = 0;
  juice.slowMo = 0;
  juice.timeScale = 1;
  juice.trauma = 0;
  juice.flash = 0;
}

// dev: slow every effect and the fight with them (`__juice.speed = 0.05`) to look at a frame
if (import.meta.env.DEV) Object.assign(window, { __juice: juice });
