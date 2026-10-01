import { useEffect } from "react";
import { useGame, isBossRound } from "../game/store";
import { unlockAudio } from "./engine";
import { music, type MusicMode } from "./music";
import { battleSfx, sfx } from "./sfx";

if (import.meta.env.DEV) Object.assign(window, { __sfx: { battleSfx, sfx }, __music: music });

/** Unlocks audio on the first gesture and steers the soundtrack from game state. */
export function AudioDirector() {
  useEffect(() => {
    // iOS Safari only lets audio start from some gestures (touchend / pointerup),
    // so listen to all of them; unlockAudio is cheap once the context runs
    const unlock = () => unlockAudio();
    const events = ["pointerdown", "pointerup", "touchend", "keydown"] as const;
    for (const e of events) window.addEventListener(e, unlock);
    return () => {
      for (const e of events) window.removeEventListener(e, unlock);
    };
  }, []);

  useEffect(() => {
    const apply = (s: ReturnType<typeof useGame.getState>) => {
      const mode: MusicMode =
        s.phase === "battle"
          ? !s.pvp && !s.ghost && isBossRound(s.round)
            ? "boss"
            : "battle"
          : s.phase === "result"
            ? "result"
            : "prep";
      music.setMode(mode);
      music.setTension(s.phase === "battle" && s.health <= 25);
    };
    apply(useGame.getState());
    return useGame.subscribe(apply);
  }, []);

  return null;
}
