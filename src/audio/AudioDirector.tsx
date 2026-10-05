import { useEffect } from "react";
import { pvpMe, useGame } from "../game/store";
import { isBossRound, vsRoundKind } from "../game/tuning";
import { useProfile } from "../profile/store";
import { useMoment } from "../ui/Moments";
import { unlockAudio } from "./engine";
import { music, type Theme } from "./music";
import { battleSfx, sfx } from "./sfx";

if (import.meta.env.DEV) Object.assign(window, { __sfx: { battleSfx, sfx }, __music: music });

/** the solo run's last round: Lucemon */
const VICTORY_ROUND = 15;

/** Unlocks audio on the first gesture and steers the soundtrack from game state. */
export function AudioDirector() {
  useEffect(() => {
    // iOS Safari only lets audio start from some gestures (touchend / pointerup), so
    // listen to all of them — in the capture phase, so no handler that stops an event's
    // propagation can swallow the first tap; unlockAudio is cheap once the context runs
    const unlock = () => {
      unlockAudio();
      music.sync();
    };
    // a desktop browser already counts the title screen's tap: the music can start now
    music.sync();
    const events = ["pointerdown", "pointerup", "touchend", "click", "keydown"] as const;
    for (const e of events) window.addEventListener(e, unlock, { capture: true });
    return () => {
      for (const e of events) window.removeEventListener(e, unlock, { capture: true });
    };
  }, []);

  useEffect(() => {
    // the theme changes only when the mood does — not on every store tick (a victory
    // track that ended hands over to the island and mustn't restart)
    let last: Theme | null = null;
    const apply = () => {
      const s = useGame.getState();
      const menu = useProfile.getState().screen === "menu";
      const boss = s.pvp ? vsRoundKind(s.round) === "boss" : !s.ghost && isBossRound(s.round);
      const wonRun = !s.pvp && !s.ghost && s.phase === "result" && s.result === "win" && s.round === VICTORY_ROUND;
      const wonVs = !!s.pvp && s.pvp.snap.stage === "over" && pvpMe(s.pvp)?.placement === 1;
      // a boss's cut-in brings its music in before the fight
      const intro = useMoment.getState().intro;
      const theme: Theme = menu
        ? "island"
        : intro
          ? intro.kind
          : s.phase === "battle"
          ? !s.pvp && !s.ghost && s.round === VICTORY_ROUND
            ? "final"
            : boss
              ? "boss"
              : "battle"
          : wonRun || wonVs
            ? "victory"
            : "island";
      if (theme !== last) {
        last = theme;
        music.setTheme(theme);
      }
      music.setTension(!menu && s.phase === "battle" && s.health <= 25);
    };
    apply();
    const offGame = useGame.subscribe(apply);
    const offProfile = useProfile.subscribe(apply);
    const offMoment = useMoment.subscribe(apply);
    return () => {
      offGame();
      offProfile();
      offMoment();
    };
  }, []);

  return null;
}
