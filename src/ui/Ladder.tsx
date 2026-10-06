import { useEffect, useState, type CSSProperties } from "react";
import { FORMS } from "../game/creatures";
import { useGame } from "../game/store";
import { fetchLadderTop, fightGhost, ladderReady, leagueOf, loadLadderMe, useLadder, type LadderTop } from "../net/ladder";
import { myPublicKey } from "../net/leaderboard";
import { sfx } from "../audio/sfx";
import { BlackGear } from "./kit";
import { Portrait } from "./Portrait";

/**
 * The ghost ladder (ゴースト): your league and rating, a fight against a ghost of your run's
 * round, and the ladder's top tamers.
 */
export function Ladder({ onClose }: { onClose: () => void }) {
  const me = useLadder((s) => s.me);
  const busy = useLadder((s) => s.busy);
  const error = useLadder((s) => s.error);
  const round = useGame((s) => s.round);
  const [top, setTop] = useState<LadderTop[] | null>(null);
  useEffect(() => {
    useLadder.setState({ error: null });
    void loadLadderMe();
    fetchLadderTop()
      .then(setTop)
      .catch(() => setTop([]));
  }, []);
  const lp = me?.lp ?? 1000;
  const lg = leagueOf(lp);
  const pct = lg.next ? Math.max(0, Math.min(100, (100 * (lp - lg.from)) / (lg.next.from - lg.from))) : 100;
  const why = ladderReady();
  const [self, setSelf] = useState<string | null>(null);
  useEffect(() => {
    void myPublicKey().then(setSelf);
  }, []);
  return (
    <div className="dv-overlay" onClick={onClose}>
      <section className="dv glass ladder" onClick={(e) => e.stopPropagation()} aria-label="Ghost ladder">
        <header className="dv-head">
          <h2 className="rib orange">
            <span className="in">
              GHOST LADDER <span className="jp">ゴースト</span>
            </span>
          </h2>
          <button className="dv-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="ld-card" style={{ "--lg": lg.color } as CSSProperties}>
          <span className="ld-emblem">
            <b>{lg.jp}</b>
          </span>
          <div className="ld-info">
            <span className="ld-league">{lg.name} LEAGUE</span>
            <b className="ld-lp">
              {lp} <small>LP</small>
            </b>
            <span className="ld-rec">
              {me ? `${me.wins} won · ${me.losses} lost · best ${me.peak}` : "No ladder fights yet"}
            </span>
            {lg.next && (
              <span className="ld-bar" title={`${lg.next.name} at ${lg.next.from} LP`}>
                <i style={{ width: `${pct}%` }} />
              </span>
            )}
          </div>
        </div>
        <p className="dv-note">
          Your run's board fights a ghost: another tamer's board from the same round. Win to climb — your run is untouched, and your
          board becomes a ghost for others to meet.
        </p>
        <button
          className="sbtn ld-go"
          disabled={!!why || busy}
          onClick={() => {
            sfx.click();
            void fightGhost().then(() => {
              if (!useLadder.getState().error) onClose();
            });
          }}
        >
          <span className="sheen" />
          <span className="in">
            <BlackGear size={22} hole="#ff8a1f" />
            <b>{busy ? "FINDING A GHOST…" : `FIGHT A GHOST · ROUND ${round}`}</b>
          </span>
        </button>
        {(why || error) && <p className="fr-msg bad">{error ?? why}</p>}

        <div className="dv-sub">
          <b>TOP TAMERS · ランキング</b>
          <span>{top ? `${top.length} ranked` : "…"}</span>
        </div>
        {top && top.length === 0 && <p className="dv-note">Nobody's ranked yet — the first fights set the ladder.</p>}
        {top && top.length > 0 && (
          <ol className="ld-top">
            {top.slice(0, 10).map((t, i) => {
              const l = leagueOf(t.lp);
              return (
                <li key={t.key} className={t.key === self ? "me" : ""}>
                  <span className="ld-rank">{i + 1}</span>
                  {t.partner && FORMS[t.partner] ? <Portrait formId={t.partner} className="fr-face" /> : <span className="fr-face empty" />}
                  <span className="ld-name">{t.name}</span>
                  <span className="ld-chip" style={{ "--lg": l.color } as CSSProperties}>
                    {l.name}
                  </span>
                  <b>{t.lp}</b>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
