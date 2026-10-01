import { useState } from "react";
import { useGame } from "../game/store";
import { Portrait } from "./Portrait";

/** Live / post-battle damage dealt (and taken) by each of your units. */
export function DamageMeter() {
  const phase = useGame((s) => s.phase);
  const meter = useGame((s) => s.meter);
  const [open, setOpen] = useState(true);
  if (phase === "prep") return null;

  const { fighters, corpses, viewFlip } = useGame.getState();
  const mine = viewFlip ? "enemy" : "player";
  const rows = [...fighters, ...corpses]
    .filter((f) => f.team === mine)
    .map((f) => ({ uid: f.uid, formId: f.formId, dead: f.hp <= 0, ...(meter[f.uid] ?? { dealt: 0, taken: 0 }) }))
    .sort((a, b) => b.dealt - a.dealt);
  if (rows.length === 0) return null;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.dealt, r.taken)));

  return (
    <div className={`dmg-meter${open ? "" : " closed"}`}>
      <button className="meter-title" onClick={() => setOpen((o) => !o)}>
        Damage {open ? "▾" : "▸"}
      </button>
      {open &&
        rows.map((r) => (
          <div key={r.uid} className={`meter-row${r.dead ? " dead" : ""}`}>
            <Portrait formId={r.formId} className="meter-portrait" />
            <span className="meter-bars">
              <span className="meter-dealt" style={{ width: `${(r.dealt / max) * 100}%` }} />
              <span className="meter-taken" style={{ width: `${(r.taken / max) * 100}%` }} />
            </span>
            <span className="meter-num">{Math.round(r.dealt)}</span>
          </div>
        ))}
    </div>
  );
}
