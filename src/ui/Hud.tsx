import { BlackGear, Coin, ICON, Icon } from "./kit";
import { lazy, Suspense, useEffect, useState } from "react";
import { useGame, pvpMe, pvpName, boardCap } from "../game/store";
import { isCarouselRound, isBossRound, vsRoundKind } from "../game/tuning";
import { carouselPick, opponentOf, ratingDelta } from "../game/lobby";
import { isAugmentRound } from "../game/augments";
import { ITEMS } from "../game/items";
import { FORMS } from "../game/creatures";
import { PlanTimer } from "./PlanTimer";
import { XP_TO_NEXT as XP_VIEW } from "../game/xpView";
import { isMuted, setMuted, isMusicOn, setMusicOn, sfx } from "../audio/sfx";
import { useProfile } from "../profile/store";
import { XP } from "../profile/profile";
import { runXp, useRun } from "../profile/run";
import { RunReport, type RunEnd } from "./RunReport";
import { Avatar } from "./Portrait";
import { beginBattle } from "./Moments";
import { useEvoPeek } from "./EvolutionChoice";
import { fightGhost, leagueOf, useLadder } from "../net/ladder";
// panels opened on demand load on demand (the Guide carries every Digimon's card)
const LobbyModal = lazy(() => import("./LobbyModal").then((m) => ({ default: m.LobbyModal })));
const LeaderboardModal = lazy(() => import("./LeaderboardModal").then((m) => ({ default: m.LeaderboardModal })));
const SettingsModal = lazy(() => import("./SettingsModal").then((m) => ({ default: m.SettingsModal })));
const Guide = lazy(() => import("./Guide").then((m) => ({ default: m.Guide })));
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
  const pendingEvo = useGame((s) => s.pendingEvolution);
  const evoPeek = useEvoPeek((s) => s.peek);
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
  const toPrep = useGame((s) => s.toPrep);
  const reset = useGame((s) => s.reset);
  const simSpeed = useGame((s) => s.simSpeed);
  const loot = useGame((s) => s.loot);
  const setSimSpeed = useGame((s) => s.setSimSpeed);
  const boardUnits = useGame((s) => s.units.filter((u) => u.placement.kind === "board").length);
  // room on the board: the level's slots plus a Digivice's
  const cap = useGame((s) => boardCap(s.units, s.level, s.inventory));
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
  // the main menu's VS button: open the lobby as the board shows
  const openOnGame = useProfile((s) => s.openOnGame);
  useEffect(() => {
    if (openOnGame !== "vs") return;
    setShowPvp(true);
    useProfile.setState({ openOnGame: null });
  }, [openOnGame]);
  const [showLb, setShowLb] = useState(false);
  const ghost = useGame((s) => s.ghost);
  const difficulty = useGame((s) => s.difficulty);
  const village = useGame((s) => s.village);
  // a ghost-ladder fight's rating (just now)
  const ladderLast = useLadder((s) => s.last);
  const ladderNow = !!ladderLast && Date.now() - ladderLast.key < 120_000;
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
  // the solo run's end: game over, or round 15 fought (the run report)
  const runEnd: RunEnd | null =
    pvp || ghost ? null : gameOver ? "over" : phase === "result" && round === VICTORY_ROUND ? (result === "win" ? "complete" : "fell") : null;
  const runTotal = useRun((s) => (s.ledger && !s.ledger.paid ? runXp(s.ledger) : 0));
  const battleXp = (result === "win" ? XP.battleWon : XP.battleLost) + (result === "win" && isBossRound(round) ? XP.boss : 0);
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
            <Icon d={muted ? ICON.mute : ICON.speaker} size={18} />
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
              <Icon d={ICON.music} size={18} />
            </button>
          )}
          {!pvp && (
            <button
              className="icon-btn"
              title="Main menu — your partner and tamer card"
              disabled={phase === "battle"}
              onClick={() => useProfile.getState().setScreen("menu")}
            >
              <Icon d={ICON.home} size={18} />
            </button>
          )}
          <button className="icon-btn" title="Settings" onClick={() => setShowSettings(true)}>
            <Icon d={ICON.sliders} size={18} />
          </button>
          <button className="icon-btn" title="Tamer's Guide — how to play, every Digimon, items, VS" onClick={() => setShowHelp(true)}>
            <Icon d={ICON.book} size={18} />
          </button>
          {!pvp && (
            <button className="icon-btn vs" title="VS lobby — 2 to 8 tamers" onClick={() => setShowPvp(true)}>
              <Icon d={ICON.swords} size={16} width={2.6} /> VS
            </button>
          )}
          {!pvp && (
            <button className="icon-btn" title="Leaderboard & ghost battles" onClick={() => setShowLb(true)}>
              <Icon d={ICON.trophy} size={18} />
            </button>
          )}
        </div>
        <div className="stats">
          <div className={`stat round${!vs && isBossRound(round) ? " boss" : ""}`}>
            <small>ROUND</small> {round}
            {!vs && !ghost && difficulty !== "normal" && <span className={`diff-chip ${difficulty}`}>{difficulty.toUpperCase()}</span>}
            {!vs && !ghost && village && (
              <span className="diff-chip vmode" title="Primary Village: the fallen hatch again as babies">
                VILLAGE
              </span>
            )}
            {!vs && isBossRound(round) && (
              <span className="boss-chip">
                <BlackGear size={16} hole="#ff8a1f" /> BOSS
              </span>
            )}
            {vs && (
              <span className={`round-kind ${roundKind}`}>
                {roundKind === "pvp" ? "⚔ PvP" : roundKind === "boss" ? "☠ Boss" : "🐾 Wild"}
                {isCarouselRound(round) && " · 🎠"}
                {isAugmentRound(round) && " · ✨"}
              </span>
            )}
          </div>
          <div className="stat health">
            <Icon d={ICON.heart} size={18} fill="currentColor" /> {health}
          </div>
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
              {confirmFlag ? "Really?" : <Icon d={ICON.flag} size={16} />}
            </button>
          )}
          {streakLabel && <div className="stat streak">{streakLabel}</div>}
          <div className="stat gold">
            <Coin size={18} /> {gold}
          </div>
          <div className="stat level" title={xpNeed ? `${xpNeed - xp} XP to level ${level + 1}` : "Top level"}>
            <span className="lv">
              <small>Lv.</small>
              {level}
            </span>
            <span className="xp-row">
              <span className="xp-track">
                <span className="xp-fill" style={{ width: `${xpPct * 100}%` }} />
              </span>
              <small className="xp-num">{xpNeed ? `${xp}/${xpNeed}` : "MAX"}</small>
            </span>
          </div>
        </div>
      </div>

      <div className="actionbar">
        {/* a digivolution choice tucked away to look at the board: back to it */}
        {phase === "prep" && pendingEvo && evoPeek && (
          <button className="action evo-back" onClick={() => useEvoPeek.setState({ peek: false })}>
            <Icon d={ICON.sparkle} size={20} width={2.6} />
            <span className="action-label">Digivolve {FORMS[pendingEvo.fromFormId]?.name}</span>
          </button>
        )}
        {phase === "prep" && !vs && !(pendingEvo && evoPeek) && (
          <button className="action" disabled={boardUnits === 0} onClick={beginBattle}>
            <Icon d={ICON.swords} size={20} width={2.6} /> Start Battle
            <BoardCount n={boardUnits} cap={cap} />
          </button>
        )}
        {phase === "prep" && vs && stage === "match" && alive && pvp && !(pendingEvo && evoPeek) && (
          <div className="battle-bar">
            <button
              className="action"
              disabled={boardUnits === 0 || pvp.myReady || drafting || !!augmentOffer}
              onClick={() => pvpReadyUp()}
            >
              <span className="action-label">
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
              </span>
              {!pvp.myReady && <BoardCount n={boardUnits} cap={cap} />}
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
            <span className="runwon-sub ghost-vs">
              vs <Avatar formId={ghost.partner} className="ghost-face" /> {ghost.name} — your run is untouched
            </span>
            {ladderNow && ladderLast && (
              <span className="xp-pill">
                {ladderLast.delta === null
                  ? "rating…"
                  : ladderLast.delta === 0
                    ? "unrated"
                    : `${ladderLast.delta > 0 ? "+" : ""}${ladderLast.delta} LP · ${leagueOf(ladderLast.lp).name}`}
              </span>
            )}
            <button className={ladderNow ? "action ghost" : "action"} onClick={ghostReturn}>
              Return ▸
            </button>
            {ladderNow && (
              <button
                className="action"
                onClick={() => {
                  ghostReturn();
                  void fightGhost();
                }}
              >
                Next ghost ▸
              </button>
            )}
          </div>
        )}
        {phase === "result" && !ghost && !gameOver && !runEnd && (
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
            {!vs && (
              <span className="xp-pill" title="Tamer XP is paid when the run ends">
                {round <= VICTORY_ROUND ? (
                  <>
                    +{battleXp} XP <small>· {runTotal} this run</small>
                  </>
                ) : (
                  <>Endless · no XP</>
                )}
              </span>
            )}
            <button className="action" onClick={toPrep}>
              Continue ▸
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
                  <Avatar formId={s.partner} className="rank-face" />
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

      {runEnd && (
        <RunReport
          end={runEnd}
          best={Math.max(bestRound(), round)}
          onEndless={runEnd === "over" ? undefined : toPrep}
          onNewRun={reset}
          onMenu={() => {
            if (runEnd === "over") reset();
            useProfile.getState().setScreen("menu");
          }}
        />
      )}

      <Suspense fallback={null}>
      {(showPvp || stage === "lobby") && <LobbyModal initialCode={invite} onClose={() => setShowPvp(false)} />}
      {showLb && <LeaderboardModal onClose={() => setShowLb(false)} />}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showHelp && <Guide onClose={() => setShowHelp(false)} />}
      </Suspense>
    </>
  );
}

/** How many Digimon stand on the board out of how many it has room for (TFT's 6/7). */
function BoardCount({ n, cap }: { n: number; cap: number }) {
  return (
    <span className={`board-count${n < cap ? " short" : ""}`} title={`${n} of ${cap} Digimon on the board`}>
      {n}/{cap}
    </span>
  );
}
