import { useEffect, useState } from "react";
import { useGame } from "../game/store";
import { fetchTop, fetchBoard, playerId, type LbEntry } from "../net/leaderboard";
import { FORMS } from "../game/creatures";
import { Portrait } from "./Portrait";

/** the tamer's partner as their avatar, then their name */
function Who({ e }: { e: LbEntry }) {
  return (
    <span className="lb-name">
      {e.partner && FORMS[e.partner] ? <Portrait formId={e.partner} className="lb-face" /> : <span className="lb-face" />}
      <span className="lb-n">{e.name}</span>
    </span>
  );
}

/** Global top-50: best solo runs (with ghost battles against their saved boards)
 *  and the VS lobby rating. */
export function LeaderboardModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"best" | "rating">("best");
  const [rows, setRows] = useState<LbEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const phase = useGame((s) => s.phase);
  const pvp = useGame((s) => s.pvp);
  const boardUnits = useGame((s) => s.units.filter((u) => u.placement.kind === "board").length);
  const ghostFight = useGame((s) => s.ghostFight);
  const me = playerId();

  useEffect(() => {
    let live = true;
    setRows(null);
    setError(null);
    fetchTop(tab)
      .then((r) => live && setRows(r))
      .catch(() => live && setError("Leaderboard unavailable — try again later."));
    return () => {
      live = false;
    };
  }, [tab]);

  const canFight = phase === "prep" && !pvp && boardUnits > 0;

  const fight = async (e: LbEntry) => {
    setBusy(e.id);
    try {
      const board = await fetchBoard(e.id);
      ghostFight(board, e.name);
      onClose();
    } catch {
      setError(`${e.name}'s board could not be loaded.`);
      setBusy(null);
    }
  };

  return (
    <div className="help-overlay" onClick={onClose}>
      <div className="help-modal lb" onClick={(ev) => ev.stopPropagation()}>
        <div className="help-title">
          RANKING <span className="jp">ランキング</span>
        </div>
        <span className="lb-season">Season 2 · tier rules</span>
        <div className="lb-tabs">
          <button className={`lb-tab${tab === "best" ? " on" : ""}`} onClick={() => setTab("best")}>
            Best runs
          </button>
          <button className={`lb-tab${tab === "rating" ? " on" : ""}`} onClick={() => setTab("rating")}>
            VS rating
          </button>
        </div>
        {!rows && !error && <div className="lb-loading">Loading…</div>}
        {error && <div className="pvp-error">{error}</div>}
        {rows && rows.length === 0 && (
          <div className="lb-loading">
            {tab === "best" ? "No tamers yet — finish a run to enter!" : "No VS matches yet — create a lobby!"}
          </div>
        )}
        {rows && rows.length > 0 && tab === "rating" && (
          <div className="lb-table">
            {rows.map((e, i) => (
              <div key={e.id} className={`lb-row rating${e.id === me ? " me" : ""}`}>
                <span className="lb-rank">{i + 1}</span>
                <Who e={e} />
                <span className="lb-best" title="VS lobby rating">★{e.rating ?? 0}</span>
                <span className="lb-wins" title="VS matches won">⚔{e.wins}</span>
              </div>
            ))}
          </div>
        )}
        {rows && rows.length > 0 && tab === "best" && (
          <div className="lb-table">
            {rows.map((e, i) => (
              <div key={e.id} className={`lb-row${e.id === me ? " me" : ""}`}>
                <span className="lb-rank">{i + 1}</span>
                <Who e={e} />
                <span className="lb-best" title="Best round reached">R{e.best}</span>
                <span className="lb-wins" title="VS match wins">⚔{e.wins}</span>
                {e.hasBoard ? (
                  <button
                    className="lb-fight"
                    disabled={!canFight || busy !== null}
                    title={canFight ? `Fight ${e.name}'s best board (no risk)` : "Place units on your board first (prep, solo)"}
                    onClick={() => fight(e)}
                  >
                    {busy === e.id ? "…" : "Fight"}
                  </button>
                ) : (
                  <span className="lb-fight none">—</span>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="pvp-note">
          {tab === "best"
            ? "Ghost battles are friendly scrims — win or lose, your run is untouched."
            : "Every VS match moves your rating by your place: up to +40 for 1st of eight, less in smaller lobbies."}
        </div>
        <button className="action ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
