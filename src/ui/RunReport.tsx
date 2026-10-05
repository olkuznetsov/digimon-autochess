import { useEffect, useState, type CSSProperties } from "react";
import { ELEMENT_COLOR, FORMS } from "../game/creatures";
import type { Element } from "../game/types";
import { levelFor } from "../profile/profile";
import { RUN_ROUNDS, runXp, useRun, xpLines } from "../profile/run";
import { useProfile } from "../profile/store";
import { sfx } from "../audio/sfx";
import { ELEMENT_PATH, ICON, Icon } from "./kit";
import { Portrait } from "./Portrait";

/** how a run report opens: round 15 won, round 15 lost (still standing), or game over */
export type RunEnd = "complete" | "fell" | "over";

const TITLE: Record<RunEnd, [string, string]> = {
  complete: ["RUN COMPLETE!", "クリア！"],
  fell: ["THE FINAL BOSS STANDS", "まだまだ！"],
  over: ["GAME OVER", "ゲームオーバー"],
};

const short = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));

function minutes(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
}

/** A number running up from `from` to `to` (the XP bar filling), after a beat. */
function useCountUp(from: number, to: number, ms: number, delay: number): number {
  const [v, setV] = useState(from);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now() + delay;
    const step = (now: number) => {
      const k = Math.max(0, Math.min(1, (now - t0) / ms));
      setV(from + (to - from) * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [from, to, ms, delay]);
  return v;
}

/** The end of a solo run: what it did, its MVP, and the tamer XP it paid — the XP bar fills
 *  up on the spot. Over the island by day for a win, at dusk for a fall. */
export function RunReport({
  end,
  best,
  onEndless,
  onNewRun,
  onMenu,
}: {
  end: RunEnd;
  /** the tamer's best round */
  best: number;
  onEndless?: () => void;
  onNewRun: () => void;
  onMenu: () => void;
}) {
  const l = useRun((s) => s.ledger);
  const tamerXp = useProfile((s) => s.xp);
  const xp = l ? (l.paid?.xp ?? runXp(l)) : 0;
  const before = l?.paid?.before ?? tamerXp;
  const shown = useCountUp(before, before + xp, 1400, 700);
  const levelBefore = levelFor(before).level;
  const now = levelFor(shown);
  const leveled = now.level > levelBefore;
  useEffect(() => {
    if (leveled) sfx.evolve();
  }, [leveled]);
  if (!l) return null;

  const endless = l.round > RUN_ROUNDS;
  const [title, jp] = end === "over" && endless ? ["ENDLESS OVER", "おつかれさま！"] : TITLE[end];
  const sub =
    end === "complete"
      ? `All ${RUN_ROUNDS} rounds and the final boss — beaten.`
      : end === "fell"
        ? "Round 15 is fought and the run's XP is in. Fight on in endless?"
        : endless
          ? `You lasted to round ${l.round}.`
          : `Your team fell in round ${l.round}.`;
  const mvp = Object.values(l.units).sort((a, b) => b.dealt - a.dealt)[0];
  const topEl = (Object.entries(l.elements) as [Element, number][]).sort((a, b) => b[1] - a[1])[0]?.[0];
  const lines = xpLines(l).filter((x) => x.count > 0);
  const tiles: [string, string][] = [
    ["ROUND", String(l.round)],
    ["BATTLES", `${l.won}–${l.lost}`],
    ["BOSSES", String(l.bosses)],
    ["DAMAGE", short(l.dealt)],
    ["DIGIVOLVED", String(l.digivolutions)],
    ["BEST STREAK", String(l.bestStreak)],
    ["ITEMS", String(l.items)],
    ["TIME", minutes((l.endedAt ?? Date.now()) - l.startedAt)],
  ];

  return (
    <div className={`run-report ${end === "complete" ? "day" : "dusk"}`}>
      <div className="rr-scroll">
        <header className="rr-head">
          <span className="rr-jp">{jp}</span>
          <h1 className="rr-title">{title}</h1>
          <p className="rr-sub">{sub}</p>
          {best > 0 && <span className="rr-best">BEST ROUND {best}</span>}
        </header>

        <div className="rr-body">
          <section className="rr-card glass rr-run">
            <h2 className="rib orange">
              <span className="in">
                RUN REPORT <span className="jp">きろく</span>
              </span>
            </h2>
            <div className="rr-tiles">
              {tiles.map(([k, v]) => (
                <div key={k}>
                  <b>{v}</b>
                  <span>{k}</span>
                </div>
              ))}
            </div>
            {mvp && FORMS[mvp.formId] && (
              <div className="rr-mvp">
                <Portrait formId={mvp.formId} className="rr-mvp-face" />
                <div>
                  <span className="rr-label">MVP · エース</span>
                  <b>{FORMS[mvp.formId].name}</b>
                  <span className="rr-mvp-dmg">
                    {short(mvp.dealt)} damage{l.dealt > 0 && ` · ${Math.round((100 * mvp.dealt) / l.dealt)}% of the team's`}
                  </span>
                </div>
                {topEl && (
                  <span className="chip" style={{ "--c": ELEMENT_COLOR[topEl] } as CSSProperties}>
                    <Icon d={ELEMENT_PATH[topEl]} size={13} width={2.6} /> {topEl.toUpperCase()}
                  </span>
                )}
              </div>
            )}
            {l.board.length > 0 && (
              <div className="rr-team">
                <span className="rr-label">FINAL TEAM</span>
                <div className="rr-faces">
                  {l.board.slice(0, 10).map((id, i) => (
                    <Portrait key={i} formId={id} className="rr-face" />
                  ))}
                </div>
              </div>
            )}
            {l.firsts.length > 0 && (
              <div className="rr-team">
                <span className="rr-label">RAISED FOR THE FIRST TIME · はじめて</span>
                <div className="rr-faces">
                  {l.firsts.slice(0, 10).map((id) => (
                    <Portrait key={id} formId={id} className="rr-face new" />
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="rr-card glass rr-xp">
            <h2 className="rib blue">
              <span className="in">
                TAMER XP <span className="jp">けいけんち</span>
              </span>
            </h2>
            <div className="rr-lines">
              {lines.map((x) => (
                <div key={x.label} className="rr-line">
                  <span>{x.label}</span>
                  <i>{x.once ? "" : `${x.count} × ${x.each}`}</i>
                  <b>+{x.count * x.each}</b>
                </div>
              ))}
              {!lines.length && <div className="rr-line dim">No battles fought this run</div>}
              <div className="rr-line total">
                <span>Total</span>
                <i />
                <b>+{xp} XP</b>
              </div>
            </div>
            {endless && <p className="rr-note">Endless rounds earn no XP: the run paid out at round {RUN_ROUNDS}.</p>}
            <div className="rr-level">
              <span className={`rr-lv${leveled ? " up" : ""}`}>
                <small>Lv.</small>
                {now.level}
              </span>
              <span className="rr-bar">
                <i style={{ width: `${(100 * now.into) / now.need}%` }} />
              </span>
              <span className="rr-need">
                {Math.floor(now.into)} / {now.need}
              </span>
            </div>
            {leveled && (
              <div className="rr-levelup">
                <Icon d={ICON.levelUp} size={18} width={2.6} /> TAMER LEVEL UP! <span className="jp">レベルアップ</span>
              </div>
            )}
          </section>
        </div>

        <nav className="rr-actions">
          {onEndless && (
            <button className="sbtn gold rr-go" onClick={onEndless}>
              <span className="sheen" />
              <span className="in">
                <b>ENDLESS</b> <span className="jp">むげん</span>
                <Icon d={ICON.play} size={18} fill="currentColor" />
              </span>
            </button>
          )}
          <button className={`sbtn ${onEndless ? "rr-alt" : "gold rr-go"}`} onClick={onNewRun}>
            {!onEndless && <span className="sheen" />}
            <span className="in">
              <b>NEW RUN</b> <span className="jp">はじめから</span>
            </span>
          </button>
          <button className="sbtn rr-alt" onClick={onMenu}>
            <span className="in">
              <Icon d={ICON.home} size={18} /> <b>MENU</b>
            </span>
          </button>
        </nav>
      </div>
    </div>
  );
}
