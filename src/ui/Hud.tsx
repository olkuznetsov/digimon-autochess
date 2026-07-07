import { useState } from "react";
import { useGame } from "../game/store";
import { XP_TO_NEXT as XP_VIEW } from "../game/xpView";
import { isMuted, setMuted, sfx } from "../audio/sfx";

const VICTORY_ROUND = 15;

function bestRound(): number {
  try {
    return Number(localStorage.getItem("dac-best-round") ?? 0);
  } catch {
    return 0;
  }
}

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
  const [muted, setMutedUi] = useState(isMuted());
  const [showHelp, setShowHelp] = useState(false);

  const xpNeed = XP_VIEW[level];
  const xpPct = xpNeed ? Math.min(1, xp / xpNeed) : 1;
  const streakLabel = streak > 0 ? `🔥 ${streak}W` : streak < 0 ? `💀 ${-streak}L` : "";
  const beatTheRun = result === "win" && round === VICTORY_ROUND;

  return (
    <>
      <div className="topbar">
        <div className="brand-wrap">
          <div className="brand">
            DIGIMON <span>AUTO&nbsp;CHESS</span>
          </div>
          <button
            className="icon-btn"
            title={muted ? "Unmute" : "Mute"}
            onClick={() => {
              const m = !muted;
              setMuted(m);
              setMutedUi(m);
              if (!m) sfx.click();
            }}
          >
            {muted ? "🔇" : "🔊"}
          </button>
          <button className="icon-btn" title="How to play" onClick={() => setShowHelp(true)}>
            ❓
          </button>
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
        {phase === "result" && !gameOver && !beatTheRun && (
          <div className={`result ${result}`}>
            <span className="result-text">{result === "win" ? "VICTORY" : "DEFEAT"}</span>
            {result === "lose" && lastDamage > 0 && <span className="dmg">-{lastDamage} ♥</span>}
            <button className="action" onClick={toPrep}>
              Continue ▸
            </button>
          </div>
        )}
        {phase === "result" && !gameOver && beatTheRun && (
          <div className="result win runwon">
            <span className="result-text">🏆 RUN COMPLETE!</span>
            <span className="runwon-sub">You survived all {VICTORY_ROUND} rounds</span>
            <button className="action" onClick={toPrep}>
              Endless ▸
            </button>
            <button className="action ghost" onClick={reset}>
              New Run
            </button>
          </div>
        )}
      </div>

      {gameOver && (
        <div className="gameover">
          <div className="go-title">GAME OVER</div>
          <div className="go-sub">
            You reached round {round}
            {bestRound() > 0 && ` · Best: round ${Math.max(bestRound(), round)}`}
          </div>
          <button className="action" onClick={reset}>
            ↻ New Run
          </button>
        </div>
      )}

      {showHelp && (
        <div className="help-overlay" onClick={() => setShowHelp(false)}>
          <div className="help-modal" onClick={(e) => e.stopPropagation()}>
            <div className="help-title">How to play</div>
            <ul className="help-list">
              <li>🛒 <b>Buy Digimon</b> from the shop — they appear on your bench.</li>
              <li>🖱 <b>Drag them</b> onto the blue half of the board to fight.</li>
              <li>🧬 <b>3 copies of the same Digimon digivolve</b> — sometimes you choose the evolution path!</li>
              <li>🧩 <b>Synergies</b> (left panel): matching Attributes &amp; Families buff your team.</li>
              <li>⚔ Battles run themselves. Units gain <b>mana</b> and cast role abilities when full.</li>
              <li>🎒 Win rounds to earn <b>items</b> — click an item, then a Digimon to equip it.</li>
              <li>🔍 <b>Click any Digimon</b> to see its stats, ability and items — or to sell it.</li>
              <li>🏆 Survive <b>round {VICTORY_ROUND}</b> to complete the run. Losing costs ♥ — at 0 it's game over.</li>
            </ul>
            <button className="action" onClick={() => setShowHelp(false)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
