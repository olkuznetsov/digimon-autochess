import { create } from "zustand";
import { setBusVolumes } from "./audio/engine";
import { juice } from "./three/juice";

/** Player preferences, persisted in localStorage and applied to audio / effects. */
export interface Settings {
  /** 0..1 */
  musicVolume: number;
  sfxVolume: number;
  /** low: 1× pixel ratio, no MSAA, no shadows — for older phones */
  quality: "high" | "low";
  /** no camera shake or screen flashes */
  reducedMotion: boolean;
}

const KEY = "dac-settings";

function load(): Settings {
  const prefersReduced =
    typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const defaults: Settings = { musicVolume: 0.7, sfxVolume: 0.9, quality: "high", reducedMotion: prefersReduced };
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch {
    return defaults;
  }
}

export const useSettings = create<Settings & { set: (patch: Partial<Settings>) => void }>((set) => ({
  ...load(),
  set: (patch) => set(patch),
}));

function apply(s: Settings) {
  setBusVolumes(s.musicVolume, s.sfxVolume);
  juice.shakeEnabled = !s.reducedMotion;
  juice.flashEnabled = !s.reducedMotion;
}

apply(useSettings.getState());
useSettings.subscribe((s) => {
  apply(s);
  try {
    const { musicVolume, sfxVolume, quality, reducedMotion } = s;
    localStorage.setItem(KEY, JSON.stringify({ musicVolume, sfxVolume, quality, reducedMotion }));
  } catch {
    /* private mode */
  }
});
