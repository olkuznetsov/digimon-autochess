import { useEffect, useState } from "react";
import { useGame, pvpMe, pvpName } from "../game/store";
import { isCarouselRound, isBossRound, vsRoundKind } from "../game/tuning";
import { carouselPick, opponentOf, ratingDelta } from "../game/lobby";
import { isAugmentRound } from "../game/augments";
import { ITEMS } from "../game/items";
import { PlanTimer } from "./PlanTimer";
import { XP_TO_NEXT as XP_VIEW } from "../game/xpView";
import { isMuted, setMuted, isMusicOn, setMusicOn, sfx } from "../audio/sfx";
import { LobbyModal } from "./LobbyModal";
import { LeaderboardModal } from "./LeaderboardModal";
import { SettingsModal } from "./SettingsModal";
import { Guide } from "./Guide";
import { lobbyClose, lobbyLeave } from "../net/lobby";
import { CHANNEL, TEST_CHANNEL } from "../channel";

/** VS result screens move on by themselves — the other tamers are already planning. */
const VS_RESULT_SECONDS = 6;

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
  // only the "battle started?" bit, so the HUD doesn't re-render every sim tick
  const battleTime = useGame((s) => (s.battleTime > 0 ? 1 : 0));
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
  const simSpeed = useGame((s) => s.simSpeed);
  const loot = useGame((s) => s.loot);
  const setSimSpeed = useGame((s) => s.setSimSpeed);
  const boardUnits = useGame((s) => s.units.filter((u) => u.placement.kind === "board").length);
  const [muted, setMutedUi] = useState(isMuted());
  const [musicOn, setMusicOnUi] = useState(isMusicOn());
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // an invite link (?join=CODE) opens the VS window with the code filled in
  const [invite] = useState(() => {
    try {
      const code = new URLSearchParams(location.search).get("join")?.toUpperCase() ?? "";
      if (!/^[A-Z0-9]{4}$/.test(code)) return "";
      history.replaceState(null, "", location.pathname); // a reload shouldn't reopen it
      return code;
    } catch {
      return "";
    }
  });
  const [showPvp, setShowPvp] = useState(!!invite);
  const [showLb, setShowLb] = useState(false);
  const ghost = useGame((s) => s.ghost);
  const ghostReturn = useGame((s) => s.ghostReturn);
  const pvp = useGame((s) => s.pvp);
  const pvpReadyUp = useGame((s) => s.pvpReadyUp);
  const pvpQuit = useGame((s) => s.pvpQuit);
  const pvpSurrender = useGame((s) => s.pvpSurrender);
  const pvpStart = useGame((s) => s.pvpStart);
  const pvpWatch = useGame((s) => s.pvpWatch);
  const [confirmFlag, setConfirmFlag] = useState(false);

  const xpNeed = XP_VIEW[level];
  const xpPct = xpNeed ? Math.min(1, xp / xpNeed) : 1;
  const streakLabel = streak > 0 ? `🔥 ${streak}W` : streak < 0 ? `💀 ${-streak}L` : "";
  // VS: `pvp` is also set while waiting in the lobby (the solo run sits behind it)
  const stage = pvp?.snap.stage;
  const vs = !!pvp && stage !== "lobby";
  const me = pvpMe(pvp);
  const alive = !!me?.alive;
  const players = pvp?.snap.seats.filter((s) => s.inMatch) ?? [];
  const beatTheRun = !pvp && !ghost && result === "win" && round === VICTORY_ROUND;
  const roundKind = vsRoundKind(round);
  const nextOpp = pvp && phase === "prep" ? opponentOf(pvp.snap.plan, pvp.seat) : null;
  const waitingOn = pvp ? pvp.snap.seats.filter((s) => s.alive && s.inMatch && s.online && !s.ready && s.seat !== pvp.seat).length : 0;
  // the carousel runs before anyone locks in
  const carousel = pvp?.snap.carousel?.round === round && !pvp.snap.carousel.done ? pvp.snap.carousel : null;
  const drafting = !!carousel && !!pvp && !carouselPick(carousel, pvp.seat);
  const augmentOffer = useGame((s) => s.augmentOffer);

  // VS result screens move on by themselves
  const autoContinue = vs && phase === "result" && alive && stage === "match";
  useEffect(() => {
    if (!autoContinue) return;
    const id = setTimeout(() => {
      if (useGame.getState().phase === "result") useGame.getState().toPrep();
    }, VS_RESULT_SECONDS * 1000);
    return () => clearTimeout(id);
  }, [autoContinue, round]);

  return (
    <>
      <div className="topbar">
        <div className="brand-wrap">
          <div className="brand">
            DIGIMON <span>AUTO&nbsp;CHESS</span>
          </div>
          {TEST_CHANNEL && (
            <span className="channel-badge" title="Test build of the next rules — its own VS lobbies and leaderboard">
              TEST {CHANNEL}
            </span>
          )}
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
          {!muted && (
            <button
              className={`icon-btn${musicOn ? "" : " off"}`}
              title={musicOn ? "Music off" : "Music on"}
              onClick={() => {
                setMusicOn(!musicOn);
                setMusicOnUi(!musicOn);
              }}
            >
              ♪
            </button>
          )}
          <button className="icon-btn" title="Settings" onClick={() => setShowSettings(true)}>
            ⚙
          </button>
          <button className="icon-btn" title="Tamer's Guide — how to play, every Digimon, items, VS" onClick={() => setShowHelp(true)}>
            ❓
          </button>
          {!pvp && (
            <button className="icon-btn vs" title="VS lobby — 2 to 8 tamers" onClick={() => setShowPvp(true)}>
              ⚔ VS
            </button>
          )}
          {!pvp && (
            <button className="icon-btn" title="Leaderboard & ghost battles" onClick={() => setShowLb(true)}>
              🏆
            </button>
          )}
        </div>
        <div className="stats">
          <div className={`stat round${!vs && isBossRound(round) ? " boss" : ""}`}>
            Round {round}
            {!vs && isBossRound(round) && <span className="boss-chip">☠ BOSS</span>}
            {vs && (
              <span className={`round-kind ${roundKind}`}>
                {roundKind === "pvp" ? "⚔ PvP" : roundKind === "boss" ? "☠ Boss" : "🐾 Wild"}
                {isCarouselRound(round) && " · 🎠"}
                {isAugmentRound(round) && " · ✨"}
              </span>
            )}
          </div>
          <div className="stat health">♥ {health}</div>
          {vs && stage === "match" && alive && (
            <button
              className={`icon-btn flag${confirmFlag ? " confirm" : ""}`}
              title="Surrender the match"
              onClick={() => {
                if (!confirmFlag) {
                  setConfirmFlag(true);
                  setTimeout(() => setConfirmFlag(false), 2500);
                } else {
                  setConfirmFlag(false);
                  pvpSurrender();
                }
              }}
            >
              {confirmFlag ? "Really?" : "🏳️"}
            </button>
          )}
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
        {phase === "prep" && !vs && (
          <button className="action" disabled={boardUnits === 0} onClick={startBattle}>
            ⚔ Start Battle
          </button>
        )}
        {phase === "prep" && vs && stage === "match" && alive && pvp && (
          <div className="battle-bar">
            <button
              className="action"
              disabled={boardUnits === 0 || pvp.myReady || drafting || !!augmentOffer}
              onClick={() => pvpReadyUp()}
            >
              {pvp.myReady
                ? carousel
                  ? "Waiting for the carousel…"
                  : waitingOn > 0
                    ? `Waiting for ${waitingOn} tamer${waitingOn > 1 ? "s" : ""}…`
                    : "Starting…"
                : augmentOffer
                  ? "✨ Choose an augment"
                  : drafting
                    ? "🎠 Pick from the carousel"
                    : roundKind === "boss"
                      ? "☠ Ready for the boss"
                      : roundKind === "pve"
                        ? "🐾 Ready"
                        : nextOpp?.ghost
                          ? `👻 Ready · ${pvpName(pvp, nextOpp.seat)}'s ghost`
                          : `⚔ Ready · vs ${pvpName(pvp, nextOpp?.seat)}`}
            </button>
            <PlanTimer />
          </div>
        )}
        {phase === "prep" && vs && stage === "match" && !alive && me?.inMatch && (
          <div className="phase-tag battling">💀 Out in #{me.placement} — watching the others</div>
        )}
        {phase === "battle" && battleTime === 0 && <div className="fight-banner">FIGHT!</div>}
        {phase === "battle" && battleTime > 0 && (
          <div className="battle-bar">
            <div className="phase-tag battling">Battle in progress…</div>
            {!vs && (
              <button
                className={`icon-btn speed${simSpeed > 1 ? " on" : ""}`}
                title="Battle speed (S)"
                onClick={() => setSimSpeed(simSpeed > 1 ? 1 : 2)}
              >
                {simSpeed > 1 ? "⏩ 2×" : "▶ 1×"}
              </button>
            )}
          </div>
        )}
        {phase === "result" && ghost && (
          <div className={`result ${result}`}>
            <span className="result-text">
              {result === "win" ? "GHOST VICTORY" : "GHOST DEFEAT"}
            </span>
            <span className="runwon-sub">vs {ghost.name} — your run is untouched</span>
            <button className="action" onClick={ghostReturn}>
              Return ▸
            </button>
          </div>
        )}
        {phase === "result" && !ghost && !gameOver && !beatTheRun && (
          <div className={`result ${result}`}>
            <span className="result-text">{result === "win" ? "VICTORY" : "DEFEAT"}</span>
            {vs && pvp && (
              <span className="runwon-sub">
                {roundKind === "boss"
                  ? "vs the stage boss"
                  : roundKind === "pve"
                    ? "vs wild Digimon"
                    : pvp.fight?.ghost
                      ? `vs ${pvpName(pvp, pvp.fight.opp)}'s ghost`
                      : `vs ${pvpName(pvp, pvp.fight?.opp)}`}
              </span>
            )}
            {loot && (loot.gold > 0 || loot.items.length > 0) && (
              <span className="loot">
                +{loot.gold}⛂ {loot.items.map((id) => ITEMS[id]?.emoji ?? "").join(" ")}
              </span>
            )}
            {result === "win" && !vs && isBossRound(round) && <span className="boss-reward">👑 Boss bonus: +item +3⛂</span>}
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

      {pvp?.selfOffline && !pvp.connLost && <div className="net-banner">📡 Connection dropped — reconnecting…</div>}

      {/* (an update while in the lobby shows in the lobby window instead) */}
      {pvp?.connLost && !(pvp.outdated && pvp.snap.stage === "lobby") && (
        <div className="gameover">
          <div className="go-title draw">{pvp.outdated ? "🔄 GAME UPDATED" : "📡 CONNECTION LOST"}</div>
          <div className="go-sub">
            {pvp.outdated
              ? "A new version is out — reload to play VS again. Your solo run is saved."
              : `Couldn't get back into room ${pvp.code}`}
          </div>
          {pvp.outdated && (
            <button className="action" onClick={() => location.reload()}>
              ↻ Reload
            </button>
          )}
          <button
            className={pvp.outdated ? "action ghost" : "action"}
            onClick={() => {
              lobbyClose();
              pvpQuit();
            }}
          >
            {pvp.outdated ? "Back to Solo" : "↻ Back to Solo"}
          </button>
        </div>
      )}

      {vs && pvp && me && stage === "match" && !me.alive && !pvp.watching && phase !== "battle" && !pvp.connLost && (
        <div className="gameover">
          <div className="go-title long lose">💀 KNOCKED OUT</div>
          <div className="go-sub">
            You finish <b>#{me.placement}</b> of {players.length}
          </div>
          <button className="action" onClick={pvpWatch}>
            👁 Watch the rest
          </button>
          <button className="action ghost" onClick={lobbyLeave}>
            ↻ Back to Solo
          </button>
        </div>
      )}

      {vs && pvp && stage === "over" && phase !== "battle" && !pvp.connLost && (
        <div className="gameover">
          <div className={`go-title long ${me?.placement === 1 ? "win" : "lose"}`}>
            {me?.placement === 1 ? "🏆 LAST TAMER STANDING" : me?.inMatch ? `#${me.placement} of ${players.length}` : "MATCH OVER"}
          </div>
          <div className="final-ranks">
            {[...players]
              .sort((a, b) => (a.placement ?? 9) - (b.placement ?? 9))
              .map((s) => (
                <div key={s.seat} className={`final-rank${s.seat === pvp.seat ? " me" : ""}`}>
                  <span className="fr-place">#{s.placement}</span>
                  <span className="fr-name">{s.name}</span>
                  {s.placement === 1 && <span>🏆</span>}
                </div>
              ))}
          </div>
          {me?.inMatch && me.placement !== null && (
            <div className="go-sub">
              Rating {ratingDelta(pvp.snap.players, me.placement) >= 0 ? "+" : ""}
              {ratingDelta(pvp.snap.players, me.placement)}
            </div>
          )}
          {pvp.snap.host === pvp.seat ? (
            <button
              className="action"
              disabled={pvp.snap.seats.filter((s) => s.online).length < 2}
              onClick={pvpStart}
            >
              ⚔ Play again
            </button>
          ) : (
            <div className="pvp-waiting">{pvpName(pvp, pvp.snap.host)} can start another match…</div>
          )}
          <button className="action ghost" onClick={lobbyLeave}>
            ↻ Back to Solo
          </button>
        </div>
      )}

      {gameOver && !pvp && (
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

      {(showPvp || stage === "lobby") && <LobbyModal initialCode={invite} onClose={() => setShowPvp(false)} />}
      {showLb && <LeaderboardModal onClose={() => setShowLb(false)} />}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showHelp && <Guide onClose={() => setShowHelp(false)} />}
    </>
  );
}
