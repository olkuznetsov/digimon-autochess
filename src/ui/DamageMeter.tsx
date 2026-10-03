import { useState } from "react";
import { useGame, meterRows, type MeterRow } from "../game/store";
import { Portrait } from "./Portrait";

/** The rows of a damage meter: dealt (bar + number) and taken, per unit. */
export function MeterRows({ rows }: { rows: MeterRow[] }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.dealt, r.taken)));
  return (
    <>
      {rows.map((r) => (
        <div key={r.uid} className={`meter-row${r.dead ? " dead" : ""}`}>
          <Portrait formId={r.formId} className="meter-portrait" />
          <span className="meter-bars">
            <span className="meter-dealt" style={{ width: `${(r.dealt / max) * 100}%` }} />
            <span className="meter-taken" style={{ width: `${(r.taken / max) * 100}%` }} />
          </span>
          <span className="meter-num">{Math.round(r.dealt)}</span>
        </div>
      ))}
    </>
  );
}

/** Live / post-battle damage dealt (and taken) by each of your units. In prep the last
 *  battle's meter is a tab of the synergy panel. */
export function DamageMeter() {
  const phase = useGame((s) => s.phase);
  useGame((s) => s.meter);
  const [open, setOpen] = useState(true);
  if (phase === "prep") return null;
  const rows = meterRows(useGame.getState());
  if (rows.length === 0) return null;

  return (
    <div className={`dmg-meter${open ? "" : " closed"}`}>
      <button className="meter-title" onClick={() => setOpen((o) => !o)}>
        Damage {open ? "▾" : "▸"}
      </button>
      {open && <MeterRows rows={rows} />}
    </div>
  );
}
