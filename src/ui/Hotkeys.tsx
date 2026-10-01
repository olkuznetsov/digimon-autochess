import { useEffect } from "react";
import { useGame } from "../game/store";

/**
 * Keyboard shortcuts: D reroll · F buy XP · 1–5 buy · L lock shop · E sell the
 * inspected unit · Space start / ready / continue · S battle speed · Esc close.
 */
export function Hotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const s = useGame.getState();
      const key = e.key.toLowerCase();

      if (s.phase === "prep" && !s.pendingEvolution) {
        if (key === "d") s.reroll();
        else if (key === "f") s.buyXp();
        else if (key === "l") s.toggleShopLock();
        else if (key >= "1" && key <= "5") s.buy(Number(key) - 1);
        else if (key === "e" && s.inspected) s.sellUnit(s.inspected);
        else if (key === " ") {
          e.preventDefault();
          if (s.pvp) {
            if (!s.pvp.myReady && s.pvp.oppOnline) s.pvpReadyUp();
          } else s.startBattle();
        }
      } else if (s.phase === "result" && key === " ") {
        e.preventDefault();
        if (s.ghost) s.ghostReturn();
        else if (!s.gameOver && !s.pvp) s.toPrep();
      } else if (s.phase === "battle" && key === "s" && !s.pvp) {
        s.setSimSpeed(s.simSpeed > 1 ? 1 : 2);
      }
      if (key === "escape") s.setInspected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
