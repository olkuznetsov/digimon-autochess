import { useEffect, useRef, useState, type CSSProperties } from "react";
import { create } from "zustand";
import { ATTR_COLOR, FORMS } from "../game/creatures";
import { useGame } from "../game/store";
import { isBossRound, makeEnemyWave } from "../game/tuning";
import { BlackGear } from "./kit";
import { Portrait } from "./Portrait";

/**
 * Digimon Adventure's big moments, as cut-ins over the board: a boss walking in (over the
 * Black Gears' dusk), the final battle (under the eclipse), and a digivolution's
 * 「アグモン進化ー！ … グレイモン！」.
 */

/** the solo run's final round */
const FINAL_ROUND = 15;
const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Intro {
  kind: "boss" | "final";
  formId: string;
  round: number;
  key: number;
}
export const useMoment = create<{ intro: Intro | null }>(() => ({ intro: null }));

/** Start Battle: a solo boss round first plays its cut-in, then the fight begins. */
export function beginBattle() {
  const s = useGame.getState();
  if (useMoment.getState().intro) return;
  if (s.phase !== "prep" || s.pendingEvolution || s.pvp || s.ghost || !isBossRound(s.round) || reducedMotion())
    return s.startBattle();
  if (!s.units.some((u) => u.placement.kind === "board")) return;
  const boss = makeEnemyWave(s.round, s.runSeed)[0];
  if (!boss) return s.startBattle();
  useMoment.setState({ intro: { kind: s.round === FINAL_ROUND ? "final" : "boss", formId: boss.formId, round: s.round, key: Date.now() } });
}

function endIntro() {
  const intro = useMoment.getState().intro;
  if (!intro) return;
  useMoment.setState({ intro: null });
  const s = useGame.getState();
  if (s.phase === "prep" && s.round === intro.round) s.startBattle();
}

/** The boss's cut-in (or the final battle's), then the fight. A tap skips it. */
export function BattleIntro() {
  const intro = useMoment((s) => s.intro);
  useEffect(() => {
    if (!intro) return;
    const t = setTimeout(endIntro, intro.kind === "final" ? 3000 : 2100);
    return () => clearTimeout(t);
  }, [intro]);
  if (!intro) return null;
  const name = FORMS[intro.formId]?.name ?? "???";
  if (intro.kind === "final")
    return (
      <div className="moment final" key={intro.key} onPointerDown={endIntro} role="presentation">
        <div className="mf-sky" />
        <div className="mf-text">
          <span className="mf-jp">最終決戦</span>
          <b className="mf-title">FINAL BATTLE</b>
          <span className="mf-boss">
            <Portrait formId={intro.formId} className="mf-face" />
            {name.toUpperCase()}
          </span>
        </div>
      </div>
    );
  return (
    <div className="moment boss" key={intro.key} onPointerDown={endIntro} role="presentation">
      <div className="mb-tape top">
        <span>{"WARNING · けいこく · ".repeat(12)}</span>
      </div>
      <div className="mb-band">
        <div className="mb-text">
          <span className="mb-jp">ボス戦 · ROUND {intro.round}</span>
          <b className="mb-title">BOSS BATTLE</b>
          <span className="mb-vs">VS {name.toUpperCase()}</span>
        </div>
        <div className="mb-face-wrap">
          <BlackGear size={150} hole="#2a0d1c" className="mb-gear" />
          <Portrait formId={intro.formId} className="mb-face" />
        </div>
      </div>
      <div className="mb-tape bottom">
        <span>{"WARNING · けいこく · ".repeat(12)}</span>
      </div>
    </div>
  );
}

/** 「アグモン進化ー！ … グレイモン！」 — the form calls out, a flash, the new form's name. */
export function EvoCutIn({ from, to, onDone }: { from: string; to: string; onDone?: () => void }) {
  const [phase, setPhase] = useState<"from" | "to">("from");
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const a = setTimeout(() => setPhase("to"), 900);
    const b = setTimeout(() => done.current?.(), 2500);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);
  const f = FORMS[from];
  const t = FORMS[to];
  if (!f || !t) return null;
  const color = ATTR_COLOR[(phase === "from" ? f : t).attribute];
  return (
    <div className={`moment evo ${phase}`} style={{ "--c": color } as CSSProperties} aria-live="polite">
      <div className="me-band">
        <span className="me-lines" />
        <span className="me-crest">
          <Portrait formId={phase === "from" ? from : to} className="me-face" key={phase} />
        </span>
        {phase === "from" ? (
          <span className="me-text" key="from">
            <b>{f.name.toUpperCase()}</b>
            <span className="me-call">進化ー！</span>
          </span>
        ) : (
          <span className="me-text to" key="to">
            <span className="me-call small">DIGIVOLVES TO</span>
            <b>{t.name.toUpperCase()}!</b>
          </span>
        )}
      </div>
      {phase === "to" && <span className="me-flash" />}
    </div>
  );
}

/** A board digivolution's cut-in (star-ups keep the small banner). */
export function EvoMoment() {
  const flash = useGame((s) => s.evoFlash);
  const [shown, setShown] = useState<{ from: string; to: string; key: number } | null>(null);
  useEffect(() => {
    if (!flash || flash.star || flash.from === flash.to || reducedMotion()) return;
    setShown({ from: flash.from, to: flash.to, key: flash.key });
  }, [flash]);
  if (!shown) return null;
  return <EvoCutIn key={shown.key} from={shown.from} to={shown.to} onDone={() => setShown(null)} />;
}

if (import.meta.env.DEV) Object.assign(window, { __moment: { useMoment, useGame } });
