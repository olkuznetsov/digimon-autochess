import { useGame } from "../game/store";
import { opponentOf, START_HP } from "../game/lobby";
import { AUGMENTS } from "../game/augments";
import { Avatar } from "./Portrait";

/** VS lobby players: HP, who's locked in, who we fight; click one to scout their board. */
export function Standings() {
  const pvp = useGame((s) => s.pvp);
  const phase = useGame((s) => s.phase);
  const pvpScout = useGame((s) => s.pvpScout);
  if (!pvp || pvp.snap.stage === "lobby") return null;

  const seats = pvp.snap.seats.filter((s) => s.inMatch);
  const standing = seats.filter((s) => s.alive).length;
  // alive by HP, then the fallen by place
  const rows = [...seats].sort((a, b) =>
    a.alive !== b.alive ? (a.alive ? -1 : 1) : a.alive ? b.hp - a.hp : (a.placement ?? 9) - (b.placement ?? 9),
  );
  // in planning: this round's opponent; in a fight: the one on screen
  const opp =
    phase === "prep"
      ? opponentOf(pvp.snap.plan, pvp.seat)
      : pvp.fight?.opp != null
        ? { seat: pvp.fight.opp, ghost: pvp.fight.ghost }
        : null;

  return (
    <div className="standings">
      <div className="tray-title">
        Tamers <span className="st-count">{standing}/{seats.length}</span>
      </div>
      {rows.map((s) => {
        const me = s.seat === pvp.seat;
        const against = opp?.seat === s.seat;
        const scouted = pvp.scout === s.seat;
        const canScout = !me && s.alive && phase === "prep" && pvp.snap.stage === "match";
        return (
          <button
            key={s.seat}
            className={`st-row${me ? " me" : ""}${s.alive ? "" : " out"}${against ? " opp" : ""}${scouted ? " scouted" : ""}`}
            disabled={!canScout}
            title={canScout ? (scouted ? "Back to your opponent" : `Scout ${s.name}'s board`) : undefined}
            onClick={() => pvpScout(s.seat)}
          >
            <span className="st-name">
              {against && <span className="st-tag">{opp?.ghost ? "👻" : "⚔"}</span>}
              <Avatar formId={s.partner} className="st-face" />
              <span className="st-label">{s.name}</span>
              {!s.online && <span className="st-off" title="Offline — their last board plays">📡</span>}
              {(s.augments ?? []).length > 0 && (
                <span className="st-augs" title={(s.augments ?? []).map((id) => AUGMENTS[id]?.name ?? id).join(", ")}>
                  {(s.augments ?? []).map((id) => AUGMENTS[id]?.emoji ?? "").join("")}
                </span>
              )}
              <span className="st-right">
                {s.alive && s.ready && phase === "prep" && <span className="st-ready">✓</span>}
                <span className="st-num">{s.alive ? s.hp : `#${s.placement}`}</span>
              </span>
            </span>
            {s.alive && (
              <span className="st-hp">
                <span className="st-fill" style={{ width: `${Math.max(0, Math.min(1, s.hp / START_HP)) * 100}%` }} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
