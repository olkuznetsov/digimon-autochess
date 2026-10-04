import { FORMS } from "../game/creatures";
import { pvpMe, useGame } from "../game/store";
import { isBossRound, vsRoundKind } from "../game/tuning";
import { XP } from "./profile";
import { useProfile } from "./store";

/**
 * Turns what happens in a game into tamer XP and stats, by watching the game store: the
 * game itself knows nothing about profiles (and src/game stays the VS rules).
 */
let started = false;
export function startProfileTracker() {
  if (started) return;
  started = true;
  useGame.subscribe((s, prev) => {
    const profile = useProfile.getState();

    // a solo run begins with its first battle
    if (prev.phase === "prep" && s.phase === "battle" && !s.pvp && !s.ghost && s.round === 1)
      profile.record((st) => {
        st.runs++;
      });

    // a battle is over
    if (prev.phase === "battle" && s.phase === "result") {
      const win = s.result === "win";
      if (s.ghost) {
        if (win) {
          profile.record((st) => {
            st.ghostWins++;
          });
          profile.gainXp(XP.ghostWon, "Ghost battle won");
        }
        return;
      }
      const board = (s.boardSnapshot ?? s.units).filter((u) => u.placement.kind === "board");
      const boss = s.pvp ? vsRoundKind(s.round) === "boss" : isBossRound(s.round);
      let xp = win ? XP.battleWon : XP.battleLost;
      let reason = win ? "Battle won" : "Battle";
      profile.record((st) => {
        st.battles++;
        if (win) st.battlesWon++;
        for (const u of board) {
          const f = FORMS[u.formId];
          if (!f) continue;
          st.elements[f.element] = (st.elements[f.element] ?? 0) + 1;
          st.attributes[f.attribute] = (st.attributes[f.attribute] ?? 0) + 1;
          st.fielded[u.formId] = (st.fielded[u.formId] ?? 0) + 1;
        }
        if (win && boss) st.bosses++;
        if (!s.pvp) {
          st.bestRound = Math.max(st.bestRound, s.round);
          if (win && s.round === 15) st.runsWon++;
        }
      });
      if (win && boss) {
        xp += XP.boss;
        reason = "Boss beaten";
      }
      if (!s.pvp && win && s.round === 15) {
        xp += XP.runWon;
        reason = "Run won";
      }
      profile.gainXp(xp, reason);
    }

    // a VS match is over
    if (s.pvp && prev.pvp && s.pvp.snap.stage === "over" && prev.pvp.snap.stage !== "over") {
      const place = pvpMe(s.pvp)?.placement ?? s.pvp.snap.players;
      profile.record((st) => {
        st.vsMatches++;
        if (place === 1) st.vsWins++;
      });
      profile.gainXp(XP.vsBase + XP.vsPerPlace * Math.max(0, s.pvp.snap.players - place), place === 1 ? "VS won" : `VS #${place}`);
    }

    // a merge digivolved something: the tamer has raised it
    if (s.evoFlash && s.evoFlash !== prev.evoFlash) {
      const to = s.evoFlash.to;
      if (!profile.stats.raised.includes(to))
        profile.record((st) => {
          st.raised.push(to);
        });
    }
  });
}
