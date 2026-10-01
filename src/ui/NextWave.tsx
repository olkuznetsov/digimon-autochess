import { useMemo } from "react";
import { useGame } from "../game/store";
import { isBossRound, makeEnemyWave, makeVsWave, vsRoundKind } from "../game/tuning";
import { Portrait } from "./Portrait";

/** Prep-phase preview of what the coming round brings: the solo wave, the VS wild /
 *  boss wave, or the opponent's current board (live scouting). */
export function NextWave() {
  const phase = useGame((s) => s.phase);
  const round = useGame((s) => s.round);
  const pvp = useGame((s) => s.pvp);
  const kind = pvp ? vsRoundKind(round) : isBossRound(round) ? "boss" : "pve";
  const wave = useMemo(
    () =>
      (pvp ? makeVsWave(round) : makeEnemyWave(round)).map((f) => ({ id: f.uid, formId: f.formId, boss: !!f.boss })),
    [round, pvp],
  );
  if (phase !== "prep") return null;

  const units =
    pvp && kind === "pvp" ? (pvp.oppBoard ?? []).map((u) => ({ id: u.uid, formId: u.formId, boss: false })) : wave;
  const label = kind === "pvp" ? `vs ${pvp?.oppName ?? "opponent"}` : kind === "boss" ? "☠ Boss" : pvp ? "🐾 Wild" : "Next";

  return (
    <div className={`next-wave${kind === "boss" ? " boss" : ""}`}>
      <span className="next-label">{label}</span>
      {units.length === 0 && <span className="next-empty">scouting…</span>}
      {units.map((u) => (
        <Portrait key={u.id} formId={u.formId} className={`next-portrait${u.boss ? " boss" : ""}`} />
      ))}
    </div>
  );
}
