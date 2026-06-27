import { useGame } from "../game/store";
import { XP_TO_NEXT as XP_VIEW } from "../game/xpView";

export function Hud() {
  const phase = useGame((s) => s.phase);
  const gold = useGame((s) => s.gold);
  const level = useGame((s) => s.level);
  const xp = useGame((s) => s.xp);
  const health = useGame((s) => s.health);
  const round = useGame((s) => s.round);
  const streak = useGame((s) => s.streak);
  const result = useGame((s) => s.result);
  const lastDamage = useGame((s) => s.lastDamage);
  const gameOver = useGame((s) => s.gameOver);
  const startBattle = useGame((s) => s.startBattle);
  const toPrep = useGame((s) => s.toPrep);
  const reset = useGame((s) => s.reset);
  const boardUnits = useGame((s) => s.units.filter((u) => u.placement.kind === "board").length);

  const xpNeed = XP_VIEW[level];
  const xpPct = xpNeed ? Math.min(1, xp / xpNeed) : 1;
  const streakLabel = streak > 0 ? `🔥 ${streak}W` : streak < 0 ? `💀 ${-streak}L` : "";

  return (
    <>
      <div className="topbar">
        <div className="brand">
          DIGIMON <span>AUTO&nbsp;CHESS</span>
        </div>
        <div className="stats">
          <div className="stat round">Round {round}</div>
          <div className="stat health">♥ {health}</div>
          {streakLabel && <div className="stat streak">{streakLabel}</div>}
          <div className="stat gold">⛂ {gold}</div>
          <div className="stat level">
            <span className="lv">Lv {level}</span>
            <span className="xp-track">
              <span className="xp-fill" style={{ width: `${xpPct * 100}%` }} />
            </span>
          </div>
        </div>
      </div>

      <div className="actionbar">
        {phase === "prep" && (
          <button className="action" disabled={boardUnits === 0} onClick={startBattle}>
            ⚔ Start Battle
          </button>
        )}
        {phase === "battle" && <div className="phase-tag battling">Battle in progress…</div>}
        {phase === "result" && !gameOver && (
          <div className={`result ${result}`}>
            <span className="result-text">{result === "win" ? "VICTORY" : "DEFEAT"}</span>
            {result === "lose" && lastDamage > 0 && <span className="dmg">-{lastDamage} ♥</span>}
            <button className="action" onClick={toPrep}>
              Continue ▸
            </button>
          </div>
        )}
      </div>

      {gameOver && (
        <div className="gameover">
          <div className="go-title">GAME OVER</div>
          <div className="go-sub">You reached round {round}</div>
          <button className="action" onClick={reset}>
            ↻ New Run
          </button>
        </div>
      )}

      {phase === "prep" && (
        <div className="hint">
          Buy &amp; drag creatures onto the blue half · 3 of a kind digivolves · build synergies
        </div>
      )}
    </>
  );
}
