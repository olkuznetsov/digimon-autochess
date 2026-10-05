import { FORMS } from "../game/creatures";
import { meterRows, pvpMe, useGame } from "../game/store";
import { isBossRound, vsRoundKind } from "../game/tuning";
import { careBonus } from "./care";
import { XP } from "./profile";
import { RUN_ROUNDS, newLedger, runXp, updateRun, useRun } from "./run";
import { useProfile } from "./store";

/**
 * Turns what happens in a game into tamer XP and stats, by watching the game store: the
 * game itself knows nothing about profiles (and src/game stays the VS rules). A solo run's
 * battles go to its ledger (./run.ts), which pays the run's XP when the run ends; VS matches
 * and ghost battles pay as they finish.
 */

/** Hand a run's XP to the tamer (once), with the partner's bonus. `quiet` when the run
 *  report shows it. */
function payRun(reason: string, quiet: boolean) {
  const l = useRun.getState().ledger;
  if (!l || l.paid) return;
  const base = runXp(l);
  const { xp: before, partner } = useProfile.getState();
  const { happy, friends } = careBonus(partner?.care);
  const xp = useProfile.getState().gainXp(base, reason, quiet);
  // a run played to its end brings the partner a piece of meat too
  if (l.round >= 5) useProfile.getState().earnMeat(1);
  updateRun((r) => {
    r.paid = { xp, before, at: Date.now(), base, happy, friends };
    if (r.round >= 5) r.meat = (r.meat ?? 0) + 1;
  });
}

/** The ledger follows the solo run: a new run (a reset, or one another device started) pays
 *  what the old one earned and opens a fresh page. */
function followRun(seed: number, round: number) {
  const l = useRun.getState().ledger;
  if (l && l.seed === seed) return;
  if (l && !l.paid && runXp(l) > 0) payRun("Run ended early", false);
  useRun.setState({ ledger: newLedger(seed, round, useGame.getState().difficulty) });
}

let started = false;
export function startProfileTracker() {
  if (started) return;
  started = true;
  {
    const s = useGame.getState();
    if (!s.pvp && !s.ghost) followRun(s.runSeed, s.round);
  }
  useGame.subscribe((s, prev) => {
    const profile = useProfile.getState();
    const solo = !s.pvp && !s.ghost;
    if (solo && s.runSeed !== prev.runSeed) followRun(s.runSeed, s.round);

    // a solo run begins with its first battle
    if (prev.phase === "prep" && s.phase === "battle" && solo && s.round === 1)
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
          if (win && s.round === RUN_ROUNDS) st.runsWon++;
        }
      });
      if (s.pvp) return; // a VS match pays when it's over
      // a win lifts the partner's mood; a boss beaten brings it a piece of meat
      if (win) profile.cheer();
      if (win && boss) profile.earnMeat(1);

      // the solo run's ledger
      if (useRun.getState().ledger?.seed !== s.runSeed) followRun(s.runSeed, s.round);
      const rows = meterRows(s);
      updateRun((r) => {
        r.round = Math.max(r.round, s.round);
        if (win) r.won++;
        else r.lost++;
        if (win && boss) r.bosses++;
        r.hpLost += s.lastDamage;
        r.streak = win ? r.streak + 1 : 0;
        r.bestStreak = Math.max(r.bestStreak, r.streak);
        r.items += Math.max(0, s.inventory.length - prev.inventory.length);
        for (const row of rows) {
          r.dealt += row.dealt;
          const u = (r.units[row.uid] ??= { formId: row.formId, dealt: 0 });
          u.formId = row.formId;
          u.dealt += row.dealt;
        }
        // the MVP race only needs the leaders
        const top = Object.entries(r.units)
          .sort((a, b) => b[1].dealt - a[1].dealt)
          .slice(0, 12);
        r.units = Object.fromEntries(top);
        for (const u of board) {
          const f = FORMS[u.formId];
          if (f) r.elements[f.element] = (r.elements[f.element] ?? 0) + 1;
        }
        r.board = board.map((u) => u.formId);
        if (win && boss) r.meat = (r.meat ?? 0) + 1;
        if (s.round <= RUN_ROUNDS) {
          if (win) r.scored.won++;
          else r.scored.lost++;
          if (win && boss) r.scored.bosses++;
          if (win && s.round === RUN_ROUNDS) r.scored.runWon = true;
        }
        if (s.gameOver) r.endedAt = Date.now();
      });
      // the run pays out when it ends, or once the final boss has been fought
      if (s.gameOver || s.round === RUN_ROUNDS) payRun(s.gameOver ? "Run over" : "Run complete", true);
    }

    // a VS match is over
    if (s.pvp && prev.pvp && s.pvp.snap.stage === "over" && prev.pvp.snap.stage !== "over") {
      const place = pvpMe(s.pvp)?.placement ?? s.pvp.snap.players;
      profile.record((st) => {
        st.vsMatches++;
        if (place === 1) st.vsWins++;
      });
      profile.gainXp(XP.vsBase + XP.vsPerPlace * Math.max(0, s.pvp.snap.players - place), place === 1 ? "VS won" : `VS #${place}`);
      profile.earnMeat(1);
    }

    // a merge digivolved something: the tamer has raised it
    if (s.evoFlash && s.evoFlash !== prev.evoFlash) {
      const to = s.evoFlash.to;
      const first = !profile.stats.raised.includes(to);
      if (first)
        profile.record((st) => {
          st.raised.push(to);
        });
      if (solo && !s.evoFlash.star)
        updateRun((r) => {
          r.digivolutions++;
          if (first) r.firsts.push(to);
        });
    }
  });
}
