import { useMemo } from "react";
import { useGame, pvpMe, pvpName } from "../game/store";
import { isBossRound, makeEnemyWave, makeVsWave, vsRoundKind } from "../game/tuning";
import { opponentOf } from "../game/lobby";
import { Portrait } from "./Portrait";

/** Prep-phase preview of what the coming round brings: the solo wave, the VS wild /
 *  boss wave, or the board of this round's opponent — or of whoever is being
 *  scouted (live). */
export function NextWave() {
  const phase = useGame((s) => s.phase);
  const round = useGame((s) => s.round);
  const pvp = useGame((s) => s.pvp);
  const runSeed = useGame((s) => s.runSeed);
  const vs = !!pvp && pvp.snap.stage !== "lobby";
  const variant = pvp?.snap.variant ?? 0;
  const kind = vs ? vsRoundKind(round) : isBossRound(round) ? "boss" : "pve";
  const wave = useMemo(
    () =>
      (vs ? makeVsWave(round, "W", variant) : makeEnemyWave(round, runSeed)).map((f) => ({
        id: f.uid,
        formId: f.formId,
        boss: !!f.boss,
      })),
    [round, vs, variant, runSeed],
  );
  if (phase !== "prep" || (pvp && !vs)) return null;
  // the carousel panel takes this spot while it runs
  if (pvp?.snap.carousel?.round === round && !pvp.snap.carousel.done) return null;

  const opp = pvp ? opponentOf(pvp.snap.plan, pvp.seat) : null;
  const scout = pvp?.scout ?? null;
  // knocked out: nothing to preview unless scouting someone
  if (vs && !pvpMe(pvp)?.alive && scout === null) return null;
  const seat = scout ?? (kind === "pvp" ? opp?.seat : undefined);
  const units =
    pvp && seat != null ? (pvp.boards[seat] ?? []).map((u) => ({ id: u.uid, formId: u.formId, boss: false })) : wave;
  const label =
    scout !== null
      ? `🔍 ${pvpName(pvp, scout)}`
      : kind === "pvp"
        ? opp?.ghost
          ? `👻 ${pvpName(pvp, opp.seat)}'s ghost`
          : `vs ${pvpName(pvp, opp?.seat)}`
        : kind === "boss"
          ? "☠ Boss"
          : vs
            ? "🐾 Wild"
            : "Next";

  return (
    <div className={`next-wave${kind === "boss" && scout === null ? " boss" : ""}`}>
      <span className="next-label">{label}</span>
      {units.length === 0 && <span className="next-empty">scouting…</span>}
      {units.map((u) => (
        <Portrait key={u.id} formId={u.formId} className={`next-portrait${u.boss ? " boss" : ""}`} />
      ))}
    </div>
  );
}
