import { useMemo } from "react";
import { useGame } from "../game/store";
import { isBossRound, makeEnemyWave } from "../game/tuning";
import { Portrait } from "./Portrait";

/** Prep-phase preview of the enemies waiting in the coming round (solo runs). */
export function NextWave() {
  const phase = useGame((s) => s.phase);
  const round = useGame((s) => s.round);
  const pvp = useGame((s) => s.pvp);
  const wave = useMemo(() => makeEnemyWave(round).map((f) => ({ id: f.uid, formId: f.formId, boss: !!f.boss })), [round]);
  if (phase !== "prep" || pvp) return null;

  return (
    <div className={`next-wave${isBossRound(round) ? " boss" : ""}`}>
      <span className="next-label">{isBossRound(round) ? "☠ Boss" : "Next"}</span>
      {wave.map((u) => (
        <Portrait key={u.id} formId={u.formId} className={`next-portrait${u.boss ? " boss" : ""}`} />
      ))}
    </div>
  );
}
